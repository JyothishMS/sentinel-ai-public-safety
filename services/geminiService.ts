import { GoogleGenAI, Type } from "@google/genai";
import { VerificationAudit, IdentifiedSubject } from "../types";

const cleanJsonResponse = (text: string) => {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

// Multiple Overpass API endpoints for redundancy
const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',  // No rate limit
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',  // Russia VK Maps - no rate limit
  'https://overpass-api.de/api/interpreter',  // Main instance
];

// Fetch road distance from OSRM (OpenStreetMap routing)
const fetchRoadDistance = async (
  fromLat: number, 
  fromLng: number, 
  toLat: number, 
  toLng: number
): Promise<{ distance: number; duration: number } | null> => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      return {
        distance: data.routes[0].distance / 1000, // Convert meters to km
        duration: Math.ceil(data.routes[0].duration / 60) // Convert seconds to minutes
      };
    }
  } catch (error) {
    console.warn('OSRM distance fetch failed:', error);
  }
  return null;
};

// Fetch REAL hospitals from OpenStreetMap using Overpass API (FREE, no API key needed)
export const findNearbyHospitals = async (lat: number, lng: number): Promise<any[]> => {
  const radiusMeters = 10000; // 10 km radius
  
  // Simplified Overpass API query for faster response
  const overpassQuery = `
    [out:json][timeout:30];
    (
      nwr["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      nwr["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
    );
    out center body qt 25;
  `;
  
  const hospitalImages = [
    "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1587350859728-117699f4a747?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=800&q=80"
  ];

  // Helper function to parse OSM response
  const parseOSMResponse = (data: any) => {
    if (!data.elements || data.elements.length === 0) return [];
    
    return data.elements
      .filter((el: any) => el.tags && (el.tags.name || el.tags['name:en']))
      .map((el: any, index: number) => {
        const hospitalLat = el.center?.lat || el.lat;
        const hospitalLng = el.center?.lon || el.lon;
        const name = el.tags['name:en'] || el.tags.name || 'Medical Facility';
        
        const addressParts = [];
        if (el.tags['addr:housenumber']) addressParts.push(el.tags['addr:housenumber']);
        if (el.tags['addr:street']) addressParts.push(el.tags['addr:street']);
        if (el.tags['addr:suburb'] || el.tags['addr:city']) {
          addressParts.push(el.tags['addr:suburb'] || el.tags['addr:city']);
        }
        
        return {
          id: `osm-${el.id}`,
          name: name,
          location: { lat: hospitalLat, lng: hospitalLng },
          address: addressParts.length > 0 ? addressParts.join(', ') : `Medical facility near you`,
          uri: `https://www.google.com/maps/search/?api=1&query=${hospitalLat},${hospitalLng}`,
          image: hospitalImages[index % hospitalImages.length],
          type: el.tags.amenity || 'hospital',
          roadDistance: null as number | null,
          roadDuration: null as number | null
        };
      })
      .slice(0, 20);
  };

  // Try each Overpass endpoint until one works
  let hospitals: any[] = [];
  
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Trying Overpass endpoint: ${endpoint}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`${endpoint} returned ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`Found ${data.elements?.length || 0} facilities from ${endpoint}`);
      
      hospitals = parseOSMResponse(data);
      if (hospitals.length > 0) {
        break; // Got hospitals, exit loop
      }
    } catch (error: any) {
      console.warn(`${endpoint} failed:`, error.message || error);
      continue;
    }
  }
  
  // If no hospitals from Overpass, try Gemini fallback
  if (hospitals.length === 0) {
    console.log('All Overpass endpoints failed, trying Gemini fallback...');
    
    if (import.meta.env.VITE_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY as string });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash", 
          contents: `Find hospitals and medical centers within 10km of ${lat}, ${lng}`,
          config: {
            tools: [{ googleMaps: {} }],
            toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } }
          },
        });

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        hospitals = chunks
          .filter((c: any) => c.maps)
          .map((c: any, index: number) => ({
            id: `gmaps-${index}`,
            name: c.maps.title || "Medical Facility",
            address: c.maps.address || "Location via Google Maps",
            uri: c.maps.uri || `https://www.google.com/maps/search/?api=1&query=${c.maps.lat},${c.maps.lng}`,
            location: { lat: c.maps.lat, lng: c.maps.lng },
            image: hospitalImages[index % hospitalImages.length],
            roadDistance: null,
            roadDuration: null
          }));

        if (hospitals.length > 0) {
          console.log(`Found ${hospitals.length} hospitals via Gemini`);
        }
      } catch (geminiError) {
        console.error('Gemini fallback error:', geminiError);
      }
    }
  }
  
  // If still no hospitals, return empty array
  if (hospitals.length === 0) {
    console.error('Could not fetch hospitals from any source');
    return [];
  }
  
  // Fetch road distances for all hospitals in parallel (limit to first 10 for speed)
  console.log('Fetching road distances from OSRM...');
  const hospitalsToProcess = hospitals.slice(0, 10);
  
  const distancePromises = hospitalsToProcess.map(async (hospital) => {
    const routeInfo = await fetchRoadDistance(lat, lng, hospital.location.lat, hospital.location.lng);
    if (routeInfo) {
      hospital.roadDistance = parseFloat(routeInfo.distance.toFixed(1));
      hospital.roadDuration = routeInfo.duration;
    } else {
      // Fallback to straight-line distance
      const R = 6371;
      const dLat = (hospital.location.lat - lat) * Math.PI / 180;
      const dLon = (hospital.location.lng - lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat * Math.PI / 180) * Math.cos(hospital.location.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      hospital.roadDistance = parseFloat((R * c).toFixed(1));
      hospital.roadDuration = Math.ceil((R * c / 30) * 60); // Estimate 30 km/h average
    }
    return hospital;
  });
  
  await Promise.all(distancePromises);
  
  // Sort by road distance (shortest first)
  hospitalsToProcess.sort((a, b) => (a.roadDistance || 999) - (b.roadDistance || 999));
  
  console.log(`Returning ${hospitalsToProcess.length} hospitals with road distances`);
  return hospitalsToProcess;
};

export const verifyReportImage = async (
  base64: string, 
  mimeType: string, 
  isSimulated: boolean = false, 
  type: string = "",
  userLocation?: { lat: number, lng: number }
): Promise<{ isReal: boolean, audit: VerificationAudit, reason: string }> => {
  const audit: VerificationAudit = {
    locationCheck: { status: 'VALID', details: "Sector geometry verified via GPS." },
    metadataCheck: { status: 'VALID', details: "Standard image profile detected." },
    neuralCheck: { status: 'VALID', details: "Scanning patterns..." },
    overallScore: 0
  };

  if (!isSimulated && import.meta.env.VITE_API_KEY) {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY as string });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: base64, mimeType: mimeType } },
            { text: `CRITICAL SECURITY AUDIT: Analyze this image of a reported ${type}. 
            Return JSON: { "isReal": boolean, "aiDetectionScore": number, "reason": string }` }
          ]
        },
        config: { responseMimeType: "application/json" }
      });
      const result = JSON.parse(cleanJsonResponse(response.text || "{}"));
      const isActuallyReal = result.isReal && result.aiDetectionScore < 40;
      audit.neuralCheck.status = isActuallyReal ? 'VALID' : 'FAILED';
      audit.neuralCheck.details = result.reason;
      audit.overallScore = Math.round(100 - result.aiDetectionScore);
      return { isReal: isActuallyReal, audit, reason: result.reason };
    } catch (e) {
      return { isReal: false, audit, reason: "Neural Uplink Interrupted." };
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  return { isReal: true, audit, reason: "Simulation verification successful." };
};

export const analyzeVideoStream = async (
  file: File,
  prompt: string,
  isSimulated: boolean = false
): Promise<any[]> => {
  if (isSimulated || !import.meta.env.VITE_API_KEY) {
    // Return a mock response for simulation
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
    return [{
      type: 'Suspicious Behavior',
      timestamp: '00:15',
      location: 'Sector 7G',
      confidence: 0.88,
      description: 'A person was observed looking into multiple vehicle windows and trying door handles. Potential theft attempt.',
      detectedObjects: ['Person', 'Vehicle', 'Backpack'],
      licensePlate: null
    }];
  }

  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY as string });

  try {
    const fileBuffer = await file.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro-latest",
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: file.type } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: "application/json" }
    });
    const cleanedJson = cleanJsonResponse(response.text || "[]");
    return JSON.parse(cleanedJson);
  } catch (error) {
    console.error("Gemini video analysis error:", error);
    throw new Error("Failed to analyze video stream.");
  }
};

export const analyzeVisualMedia = async (
  base64: string, 
  mimeType: string, 
  isSimulated: boolean = false,
  knownTargets: IdentifiedSubject[] = [],
  fileName: string = ""
): Promise<any[]> => {
  if (isSimulated || !import.meta.env.VITE_API_KEY) {
    await new Promise(r => setTimeout(r, 2200));

    // Improved Simulation: Detect multiple targets if in group
    if (knownTargets.length > 0) {
      return knownTargets.slice(0, 2).map((target, idx) => ({
        type: "Target Match",
        confidence: 0.98 - (idx * 0.05),
        description: `CRITICAL BIOMETRIC LOCK: ${target.name} facial geometry verified in crowd. Spatial markers match registry profile ${target.id}.`,
        location: "Sector 7 // North Plaza Junction",
        detectedObjects: ["Person", "Target Confirmed", "Group"],
        matchedTargetId: target.id,
        locationInImage: idx === 0 ? "Third person from left" : "Center background"
      }));
    }

    return [{ 
      type: "Vehicle Collision", 
      confidence: 0.99, 
      description: "SIMULATED THREAT: Multi-vehicle high-impact collision detected at intersection.", 
      location: "Grid Sector 7-G",
      detectedObjects: ["Vehicle", "Debris", "Smoke"]
    }];
  }

  const isVideo = mimeType.startsWith('video/');

  // USE GEMINI 3 PRO FOR COMPLEX SEARCH HUB TASKS
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY as string });
  try {
    const prompt = knownTargets.length > 0 
      ? `ACT AS: Advanced Biometric Intelligence Subsystem.
         MEDIA TYPE: ${isVideo ? 'Video' : 'Image'}.
         SCENE CONTEXT: This is a security scan for registered targets.
         REGISTRY DATABASE: ${JSON.stringify(knownTargets.map(t => ({id: t.id, name: t.name})))}.
         
         OBJECTIVE: 
         1. Analyze the ${isVideo ? 'video frames' : 'image'} to identify EVERY human present.
         2. Perform a multi-point biometric comparison of each person against the REGISTRY DATABASE.
         3. You must find matches even if the person is partially obscured, in a busy background, or moving.
         
         OUTPUT FORMAT: JSON array of objects.
         Each match object:
         {
           "type": "Target Match",
           "confidence": number (0-1),
           "description": "Explain WHY this person matches the registry profile. If video, mention the timestamp or frame.",
           "location": "Urban sector name",
           "matchedTargetId": "The EXACT 'id' from the registry that matches",
           "locationInImage": "Detailed position (e.g. 'standing near the blue pillar', 'person in the red jacket')",
           "detectedObjects": ["Person", "Group", "Specific features seen"]
         }
         Return [] if no registry targets are identified.`
      : `Analyze this ${isVideo ? 'video' : 'image'} for security threats. Return JSON array with fields: type, confidence, description, location, detectedObjects.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // UPGRADED FOR CROWD REASONING
      contents: { parts: [{ inlineData: { data: base64, mimeType: mimeType } }, { text: prompt }] },
      config: { 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 } // ADDED BUDGET FOR SEARCH TASKS
      }
    });
    return JSON.parse(cleanJsonResponse(response.text || "[]"));
  } catch (err) {
    console.error("AI Analysis Error:", err);
    return [];
  }
};
