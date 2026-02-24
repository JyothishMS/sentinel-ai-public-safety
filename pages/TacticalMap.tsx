
import React, { useState, useRef, useEffect } from 'react';
import { Incident, IncidentType, TransportMode, VerificationAudit } from '../types';
import { verifyReportImage, findNearbyHospitals } from '../services/geminiService';
import { sendEmergencySOS } from '../services/whatsappService';

declare const L: any;

interface HospitalData {
  id: string;
  name: string;
  location: { lat: number, lng: number };
  address?: string;
  uri?: string;
  image?: string;
}

interface TacticalMapProps {
  incidents: Incident[];
  onManualReport: (incident: Incident) => void;
  onDeleteIncident: (id: string) => void;
}

const TacticalMap: React.FC<TacticalMapProps> = ({ incidents, onManualReport, onDeleteIncident }) => {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const reportFileInputRef = useRef<HTMLInputElement>(null);
  
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSOSModal, setShowSOSModal] = useState(false);
  const [discoveredHospitals, setDiscoveredHospitals] = useState<HospitalData[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<HospitalData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode | null>(null);
  
  const [navigationMode, setNavigationMode] = useState(false);
  const [routeDistance, setRouteDistance] = useState<string>('0.0 KM');
  const [nextTurn, setNextTurn] = useState<string>('Follow emergency corridor');
  const [eta, setEta] = useState<string>('CALC...');
  const [isUserMovingMap, setIsUserMovingMap] = useState(false);

  // Phone number & ambulance tracking states
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [emergencyPhone, setEmergencyPhone] = useState<string>(() => localStorage.getItem('sosEmergencyPhone') || '');
  const [alertSent, setAlertSent] = useState(false);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [whatsappSentConfirmed, setWhatsappSentConfirmed] = useState(false);
  const [ambulanceConfirmed, setAmbulanceConfirmed] = useState(false);
  const [ambulanceLocation, setAmbulanceLocation] = useState<{lat: number, lng: number} | null>(null);
  const [ambulanceETA, setAmbulanceETA] = useState<string>('CALC...');
  const [ambulanceDistance, setAmbulanceDistance] = useState<string>('0.0 KM');
  const [showAmbulanceTracking, setShowAmbulanceTracking] = useState(false);
  const [ambulanceRoutePoints, setAmbulanceRoutePoints] = useState<[number, number][]>([]);
  const [hospitalRoutePoints, setHospitalRoutePoints] = useState<[number, number][]>([]);
  const [fullRouteMode, setFullRouteMode] = useState(false); // Show both routes at once
  const [totalTripDistance, setTotalTripDistance] = useState<string>('0.0 KM');
  const [totalTripETA, setTotalTripETA] = useState<string>('CALC...');

  const userMarkerRef = useRef<any>(null);
  const ambulanceMarkerRef = useRef<any>(null);
  const hospitalMarkersRef = useRef<Map<string, any>>(new Map());
  const incidentMarkersRef = useRef<Map<string, any>>(new Map());
  const routeLineRef = useRef<any>(null);
  const routeShadowRef = useRef<any>(null);
  const routeGlowRef = useRef<any>(null);
  const ambulanceRouteRef = useRef<any>(null);
  const ambulanceRouteShadowRef = useRef<any>(null);
  const hospitalRouteRef = useRef<any>(null);
  const hospitalRouteShadowRef = useRef<any>(null);
  const navigationIntervalRef = useRef<any>(null);
  const ambulanceIntervalRef = useRef<any>(null);
  const [currentRoutePoints, setCurrentRoutePoints] = useState<[number, number][]>([]);

  // Helper function to calculate distance between two coordinates
  const calculateDistance = (from: {lat: number, lng: number}, to: {lat: number, lng: number}) => {
    const R = 6371; // Earth's radius in km
    const dLat = (to.lat - from.lat) * Math.PI / 180;
    const dLng = (to.lng - from.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const fetchRoadRoute = async (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
      console.log('Fetching route from OSRM:', url);
      
      const resp = await fetch(url);
      const data = await resp.json();
      
      if (data.routes && data.routes.length > 0) {
        const distKm = (data.routes[0].distance / 1000).toFixed(1);
        const timeMin = Math.ceil(data.routes[0].duration / 60);
        console.log(`Route found: ${distKm} KM, ${timeMin} minutes`);
        
        setRouteDistance(`${distKm} KM`);
        setEta(`${timeMin} MINS`);
        
        const routePoints = data.routes[0].geometry.coordinates.map((coord: any) => [coord[1], coord[0]]);
        console.log(`Route has ${routePoints.length} points`);
        return routePoints;
      } else {
        console.warn('No routes found in OSRM response:', data);
      }
    } catch (e) {
      console.error("Routing Error:", e);
    }
    
    // Fallback to straight line if routing fails
    console.log('Using straight line fallback');
    const dist = calculateDistance(start, end);
    setRouteDistance(`${dist.toFixed(1)} KM`);
    setEta(`${Math.ceil((dist / 40) * 60)} MINS`);
    return [[start.lat, start.lng], [end.lat, end.lng]];
  };

  const syncLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const { latitude, longitude } = p.coords;
      setUserLocation({ lat: latitude, lng: longitude });
      updateUserMarker(latitude, longitude);
      if (mapRef.current && !navigationMode) {
        mapRef.current.setView([latitude, longitude], 15);
      }
    }, (error) => {
      console.log('Geolocation error, using default location:', error);
      const defaultLat = 12.9716;
      const defaultLng = 77.5946;
      setUserLocation({ lat: defaultLat, lng: defaultLng });
      updateUserMarker(defaultLat, defaultLng);
      if (mapRef.current) {
        mapRef.current.setView([defaultLat, defaultLng], 13);
      }
    });
  };

  // Generate a random ambulance location within 2-5 km of user
  const generateAmbulanceLocation = (userLat: number, userLng: number) => {
    const distanceKm = 2 + Math.random() * 3; // 2-5 km away
    const angle = Math.random() * 2 * Math.PI;
    const latOffset = (distanceKm / 111) * Math.cos(angle);
    const lngOffset = (distanceKm / (111 * Math.cos(userLat * Math.PI / 180))) * Math.sin(angle);
    return { lat: userLat + latOffset, lng: userLng + lngOffset };
  };

  // Send emergency alert via WhatsApp
  const sendEmergencyAlert = (phone: string) => {
    if (!userLocation) {
      console.error('No user location for emergency alert');
      return;
    }
    
    // Open WhatsApp with pre-filled message
    const result = sendEmergencySOS(phone, userLocation);
    
    if (result.success) {
      console.log('WhatsApp opened successfully');
      setAlertSent(true);
      setWaitingForConfirmation(true);
    }
  };

  // User manually accepts the alert (simulating phone acceptance)
  const handleUserAcceptAlert = async () => {
    if (!userLocation) return;
    
    console.log('Emergency alert accepted - scanning for hospitals');
    setWaitingForConfirmation(false);
    setWhatsappSentConfirmed(false);
    setAmbulanceConfirmed(true);
    
    // Generate ambulance position and store it
    const ambulanceLoc = generateAmbulanceLocation(userLocation.lat, userLocation.lng);
    setAmbulanceLocation(ambulanceLoc);
    
    // Add ambulance marker to map immediately
    if (mapRef.current) {
      if (!ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current = L.marker([ambulanceLoc.lat, ambulanceLoc.lng], {
          icon: L.divIcon({
            className: 'ambulance-marker',
            html: `<div class="relative flex items-center justify-center">
                    <div class="absolute w-16 h-16 bg-red-500/40 rounded-full animate-ping"></div>
                    <div class="w-12 h-12 bg-red-600 rounded-2xl border-3 border-white shadow-[0_0_30px_rgba(220,38,38,0.8)] flex items-center justify-center text-white">
                      <i class="fa-solid fa-truck-medical text-xl"></i>
                    </div>
                  </div>`,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
          }),
          zIndexOffset: 1500
        }).addTo(mapRef.current);
      } else {
        ambulanceMarkerRef.current.setLatLng([ambulanceLoc.lat, ambulanceLoc.lng]);
      }
    }
    
    // Now scan for hospitals - show them in carousel like car mode
    setIsScanning(true);
    const hospitals = await findNearbyHospitals(userLocation.lat, userLocation.lng);
    setDiscoveredHospitals(hospitals);
    setIsScanning(false);
    
    if (hospitals.length === 0) {
      alert('No hospitals found nearby. Please try again.');
      setAmbulanceConfirmed(false);
      return;
    }
    
    // Add hospital markers to map
    if (mapRef.current) {
      hospitals.forEach(h => {
        const marker = L.marker([h.location.lat, h.location.lng], {
          icon: L.divIcon({
            className: 'hosp-marker',
            html: `<div class="w-12 h-12 bg-emerald-500 rounded-xl border-4 border-white shadow-[0_0_20px_rgba(16,185,129,0.8)] flex items-center justify-center text-white transition-all transform hover:scale-125 z-[1000] relative">
                     <i class="fa-solid fa-hospital text-xl"></i>
                   </div>`,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
          })
        }).on('click', () => handleHospitalSelect(h)).addTo(mapRef.current);
        hospitalMarkersRef.current.set(h.id, marker);
      });
      
      // Fit map to show ambulance, user, and hospitals
      const bounds = L.latLngBounds(hospitals.map(h => [h.location.lat, h.location.lng]));
      bounds.extend([userLocation.lat, userLocation.lng]);
      bounds.extend([ambulanceLoc.lat, ambulanceLoc.lng]);
      mapRef.current.fitBounds(bounds, { padding: [120, 120], animate: true });
    }
  };

  // Handle hospital selection in ambulance mode - show full route
  const handleAmbulanceHospitalSelect = async (hospital: HospitalData, ambulanceLoc: {lat: number, lng: number}) => {
    if (!userLocation || !mapRef.current) return;
    
    setSelectedHospital(hospital);
    setFullRouteMode(true);
    
    // Clear any existing routes
    clearAllRoutes();
    
    // Fetch BOTH routes
    console.log('Fetching ambulance to home route...');
    const ambulanceToHome = await fetchRoadRoute(ambulanceLoc, userLocation);
    console.log('Fetching home to hospital route...');
    const homeToHospital = await fetchRoadRoute(userLocation, hospital.location);
    
    setAmbulanceRoutePoints(ambulanceToHome);
    setHospitalRoutePoints(homeToHospital);
    
    // Calculate total distance and ETA (use pre-calculated road distance if available)
    const ambToHomeDist = calculateDistance(ambulanceLoc, userLocation);
    const homeToHospDist = hospital.roadDistance || calculateDistance(userLocation, hospital.location);
    const homeToHospTime = hospital.roadDuration || Math.ceil((homeToHospDist / 40) * 60);
    const totalDist = ambToHomeDist + homeToHospDist;
    const totalTime = Math.ceil((ambToHomeDist / 50) * 60) + homeToHospTime;
    
    setAmbulanceDistance(`${ambToHomeDist.toFixed(1)} KM`);
    setRouteDistance(`${typeof homeToHospDist === 'number' ? homeToHospDist.toFixed(1) : homeToHospDist} KM`);
    setTotalTripDistance(`${totalDist.toFixed(1)} KM`);
    setTotalTripETA(`${totalTime} MINS`);
    
    // Draw BOTH routes on map
    // 1. Ambulance to Home (RED)
    if (ambulanceToHome.length > 0) {
      ambulanceRouteShadowRef.current = L.polyline(ambulanceToHome, {
        color: '#000000',
        weight: 14,
        opacity: 0.7,
        lineJoin: 'round',
        lineCap: 'round',
        pane: 'routePane'
      }).addTo(mapRef.current);
      
      ambulanceRouteRef.current = L.polyline(ambulanceToHome, {
        color: '#ef4444', // RED
        weight: 8,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        pane: 'routePane'
      }).addTo(mapRef.current);
    }
    
    // 2. Home to Hospital (GREEN)
    if (homeToHospital.length > 0) {
      hospitalRouteShadowRef.current = L.polyline(homeToHospital, {
        color: '#000000',
        weight: 14,
        opacity: 0.7,
        lineJoin: 'round',
        lineCap: 'round',
        pane: 'routePane'
      }).addTo(mapRef.current);
      
      hospitalRouteRef.current = L.polyline(homeToHospital, {
        color: '#22c55e', // GREEN
        weight: 8,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        pane: 'routePane'
      }).addTo(mapRef.current);
    }
    
    // Ensure proper layer ordering
    if (ambulanceRouteShadowRef.current) ambulanceRouteShadowRef.current.bringToBack();
    if (hospitalRouteShadowRef.current) hospitalRouteShadowRef.current.bringToBack();
    if (ambulanceRouteRef.current) ambulanceRouteRef.current.bringToFront();
    if (hospitalRouteRef.current) hospitalRouteRef.current.bringToFront();
    if (userMarkerRef.current) userMarkerRef.current.setZIndexOffset(1000);
    if (ambulanceMarkerRef.current) ambulanceMarkerRef.current.setZIndexOffset(2000);
    
    // Fit map to show entire route
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        const allPoints = [...ambulanceToHome, ...homeToHospital];
        const bounds = L.latLngBounds(allPoints);
        bounds.extend([userLocation.lat, userLocation.lng]);
        bounds.extend([ambulanceLoc.lat, ambulanceLoc.lng]);
        bounds.extend([hospital.location.lat, hospital.location.lng]);
        mapRef.current.fitBounds(bounds, { padding: [100, 100], animate: true, maxZoom: 13 });
      }
    }, 100);
    
    // Show full route info overlay
    setShowAmbulanceTracking(true);
  };

  // Clear all route lines
  const clearAllRoutes = () => {
    const layers = [
      routeLineRef, routeShadowRef, routeGlowRef,
      ambulanceRouteRef, ambulanceRouteShadowRef,
      hospitalRouteRef, hospitalRouteShadowRef
    ];
    
    layers.forEach(ref => {
      if (ref.current && mapRef.current) {
        try {
          mapRef.current.removeLayer(ref.current);
          ref.current = null;
        } catch (e) {}
      }
    });
  };

  // Simulate ambulance moving - first to user, then to hospital
  const startAmbulanceMovement = (routePoints: [number, number][]) => {
    if (ambulanceIntervalRef.current) {
      clearInterval(ambulanceIntervalRef.current);
    }
    
    if (!routePoints || routePoints.length === 0) {
      console.error('No route points for ambulance movement');
      return;
    }
    
    let routeIndex = 0;
    const totalPoints = routePoints.length;
    
    setNextTurn('Ambulance en route to your location');
    
    ambulanceIntervalRef.current = setInterval(() => {
      routeIndex += 3; // Move 3 points at a time
      
      if (routeIndex >= totalPoints - 1) {
        // Ambulance has arrived at user
        clearInterval(ambulanceIntervalRef.current);
        ambulanceIntervalRef.current = null;
        
        // Check if we need to continue to hospital
        if (hospitalRoutePoints.length > 0 && selectedHospital) {
          setAmbulanceDistance('PICKED UP');
          setNextTurn('Proceeding to hospital');
          
          // Clear ambulance route (keep hospital route)
          if (ambulanceRouteRef.current) {
            mapRef.current?.removeLayer(ambulanceRouteRef.current);
            ambulanceRouteRef.current = null;
          }
          if (ambulanceRouteShadowRef.current) {
            mapRef.current?.removeLayer(ambulanceRouteShadowRef.current);
            ambulanceRouteShadowRef.current = null;
          }
          
          // Start moving to hospital after short delay
          setTimeout(() => {
            startHospitalJourney();
          }, 1500);
        } else {
          setAmbulanceDistance('ARRIVED');
          setNavigationMode(false);
        }
        return;
      }
      
      const newPos = routePoints[routeIndex];
      const newAmbLoc = { lat: newPos[0], lng: newPos[1] };
      setAmbulanceLocation(newAmbLoc);
      
      if (ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current.setLatLng([newPos[0], newPos[1]]);
      }
      
      // Update distance and ETA
      if (userLocation) {
        const remainingDist = calculateDistance(newAmbLoc, userLocation);
        setAmbulanceDistance(`${remainingDist.toFixed(1)} KM`);
        setAmbulanceETA(`${Math.max(1, Math.ceil((remainingDist / 50) * 60))} MINS`);
        
        // Update ambulance route to show remaining portion
        const remainingRoute = routePoints.slice(routeIndex);
        if (ambulanceRouteRef.current && remainingRoute.length > 1) {
          ambulanceRouteRef.current.setLatLngs(remainingRoute);
        }
        if (ambulanceRouteShadowRef.current && remainingRoute.length > 1) {
          ambulanceRouteShadowRef.current.setLatLngs(remainingRoute);
        }
      }
    }, 800); // Update every 800ms
  };

  // Continue journey from user to hospital
  const startHospitalJourney = () => {
    if (!hospitalRoutePoints || hospitalRoutePoints.length === 0 || !selectedHospital) {
      console.error('No hospital route');
      setNavigationMode(false);
      return;
    }
    
    let routeIndex = 0;
    const totalPoints = hospitalRoutePoints.length;
    
    setNextTurn('En route to ' + selectedHospital.name);
    
    ambulanceIntervalRef.current = setInterval(() => {
      routeIndex += 3;
      
      if (routeIndex >= totalPoints - 1) {
        // Arrived at hospital
        clearInterval(ambulanceIntervalRef.current);
        ambulanceIntervalRef.current = null;
        setRouteDistance('ARRIVED');
        setNextTurn('Reached ' + selectedHospital.name);
        setEta('NOW');
        
        // Journey complete
        setTimeout(() => {
          alert('Journey Complete! Arrived at ' + selectedHospital.name);
          stopNavigation();
        }, 2000);
        return;
      }
      
      const newPos = hospitalRoutePoints[routeIndex];
      const newLoc = { lat: newPos[0], lng: newPos[1] };
      
      if (ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current.setLatLng([newPos[0], newPos[1]]);
      }
      
      // Update distance to hospital
      const remainingDist = calculateDistance(newLoc, selectedHospital.location);
      setRouteDistance(`${remainingDist.toFixed(1)} KM`);
      setEta(`${Math.max(1, Math.ceil((remainingDist / 40) * 60))} MINS`);
      
      // Update hospital route
      const remainingRoute = hospitalRoutePoints.slice(routeIndex);
      if (hospitalRouteRef.current && remainingRoute.length > 1) {
        hospitalRouteRef.current.setLatLngs(remainingRoute);
      }
      if (hospitalRouteShadowRef.current && remainingRoute.length > 1) {
        hospitalRouteShadowRef.current.setLatLngs(remainingRoute);
      }
    }, 800);
  };

  // Handle SOS button click - show phone modal first
  const handleSOSClick = () => {
    if (emergencyPhone) {
      // Phone already saved, show transport selection
      setShowSOSModal(true);
    } else {
      // Need phone number first
      setShowPhoneModal(true);
    }
  };

  // Save phone and proceed to SOS
  const savePhoneAndProceed = () => {
    if (!emergencyPhone || emergencyPhone.length < 10) {
      alert('Please enter a valid phone number');
      return;
    }
    localStorage.setItem('sosEmergencyPhone', emergencyPhone);
    setShowPhoneModal(false);
    setShowSOSModal(true);
  };

  // Handle ambulance mode selection
  const handleAmbulanceMode = async () => {
    setShowSOSModal(false);
    setTransportMode('Ambulance');
    
    // Send emergency alert to saved phone
    await sendEmergencyAlert(emergencyPhone);
  };

  const updateUserMarker = (lat: number, lng: number) => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng]);
    } else {
      userMarkerRef.current = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'user-marker',
          html: `<div class="relative flex items-center justify-center">
                  <div class="absolute w-12 h-12 bg-blue-500/30 rounded-full animate-ping"></div>
                  <div class="w-8 h-8 bg-blue-600 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white">
                    <i class="fa-solid fa-location-arrow transform -rotate-45 text-[10px]"></i>
                  </div>
                </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })
      }).addTo(mapRef.current);
    }
  };

  const handleSOSScan = async (mode: TransportMode) => {
    if (!userLocation) {
      alert('Please enable location services to find nearby hospitals.');
      return;
    }
    setTransportMode(mode);
    setIsScanning(true);
    setShowSOSModal(false);
    setSelectedHospital(null);
    
    // Clear previous hospital markers
    hospitalMarkersRef.current.forEach(m => m.remove());
    hospitalMarkersRef.current.clear();
    
    const hospitals = await findNearbyHospitals(userLocation.lat, userLocation.lng);
    setDiscoveredHospitals(hospitals);
    setIsScanning(false);

    if (hospitals.length === 0) {
      alert('No hospitals found nearby. Please try again.');
      return;
    }

    hospitals.forEach(h => {
      const marker = L.marker([h.location.lat, h.location.lng], {
        icon: L.divIcon({
          className: 'hosp-marker',
          html: `<div class="w-12 h-12 bg-emerald-500 rounded-xl border-4 border-white shadow-[0_0_20px_rgba(16,185,129,0.8)] flex items-center justify-center text-white transition-all transform hover:scale-125 z-[1000] relative">
                   <i class="fa-solid fa-hospital text-xl"></i>
                 </div>`,
          iconSize: [48, 48],
          iconAnchor: [24, 24]
        })
      }).on('click', () => handleHospitalSelect(h)).addTo(mapRef.current);
      hospitalMarkersRef.current.set(h.id, marker);
    });

    // Fit map to show all hospitals and user location
    const bounds = L.latLngBounds(hospitals.map(h => [h.location.lat, h.location.lng]));
    bounds.extend([userLocation.lat, userLocation.lng]);
    mapRef.current.fitBounds(bounds, { padding: [120, 120], animate: true, duration: 1.5 });
  };

  const handleHospitalSelect = async (h: HospitalData) => {
    // Clear ALL existing route layers FIRST before anything else
    clearAllRoutes();
    
    setSelectedHospital(h);
    setCurrentRoutePoints([]);
    
    if (!userLocation || !mapRef.current) {
      console.error('Missing userLocation or mapRef');
      return;
    }
    
    const map = mapRef.current; // Store reference to avoid null checks
    
    // Fetch road route from user to hospital (GREEN route)
    const roadPoints = await fetchRoadRoute(userLocation, { lat: h.location.lat, lng: h.location.lng });
    
    if (!roadPoints || roadPoints.length === 0) {
      console.error('No route points returned');
      return;
    }
    
    console.log('Hospital route points:', roadPoints.length);
    setCurrentRoutePoints(roadPoints);
    setHospitalRoutePoints(roadPoints);
    
    // Use pre-calculated road distance from OSRM if available
    const hospDist = h.roadDistance || calculateDistance(userLocation, h.location);
    const hospTime = h.roadDuration || Math.ceil((hospDist / 40) * 60);
    setRouteDistance(`${hospDist.toFixed ? hospDist.toFixed(1) : hospDist} KM`);
    setEta(`${hospTime} MINS`);
    
    // Draw hospital route (GREEN) FIRST so it's on the map
    // Outer glow
    routeGlowRef.current = L.polyline(roadPoints, {
      color: '#10b981',
      weight: 20,
      opacity: 0.4,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'routePane'
    }).addTo(map);
    
    // Dark border for contrast
    routeShadowRef.current = L.polyline(roadPoints, {
      color: '#000000',
      weight: 16,
      opacity: 0.8,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'routePane'
    }).addTo(map);
    
    // Main green route line
    routeLineRef.current = L.polyline(roadPoints, { 
      color: '#22c55e', // Bright green
      weight: 10, 
      opacity: 1,
      lineJoin: 'round',
      lineCap: 'round',
      interactive: false,
      pane: 'routePane'
    }).addTo(map);
    
    console.log('Green route added to map');
    
    // If in ambulance mode, also draw ambulance route (RED)
    if (ambulanceConfirmed && ambulanceLocation) {
      setFullRouteMode(true);
      
      // Fetch ambulance to home route
      const ambulanceRoute = await fetchRoadRoute(ambulanceLocation, userLocation);
      
      if (ambulanceRoute && ambulanceRoute.length > 0) {
        console.log('Ambulance route points:', ambulanceRoute.length);
        setAmbulanceRoutePoints(ambulanceRoute);
        
        const ambDist = calculateDistance(ambulanceLocation, userLocation);
        setAmbulanceDistance(`${ambDist.toFixed(1)} KM`);
        setAmbulanceETA(`${Math.ceil((ambDist / 50) * 60)} MINS`);
        
        // Calculate totals
        const totalDist = ambDist + hospDist;
        const totalTime = Math.ceil((ambDist / 50 + hospDist / 40) * 60);
        setTotalTripDistance(`${totalDist.toFixed(1)} KM`);
        setTotalTripETA(`${totalTime} MINS`);
        
        // Draw ambulance route (RED)
        ambulanceRouteShadowRef.current = L.polyline(ambulanceRoute, {
          color: '#000000',
          weight: 16,
          opacity: 0.8,
          lineJoin: 'round',
          lineCap: 'round',
          pane: 'routePane'
        }).addTo(map);
        
        ambulanceRouteRef.current = L.polyline(ambulanceRoute, {
          color: '#ef4444', // RED
          weight: 10,
          opacity: 1,
          lineJoin: 'round',
          lineCap: 'round',
          pane: 'routePane'
        }).addTo(map);
        
        console.log('Red ambulance route added to map');
      }
    }
    
    // Ensure proper layer ordering - routes behind markers
    if (routeGlowRef.current) routeGlowRef.current.bringToBack();
    if (routeShadowRef.current) routeShadowRef.current.bringToBack();
    if (ambulanceRouteShadowRef.current) ambulanceRouteShadowRef.current.bringToBack();
    
    // Fit the map to show the entire route
    const bounds = L.latLngBounds(roadPoints);
    bounds.extend([userLocation.lat, userLocation.lng]);
    bounds.extend([h.location.lat, h.location.lng]);
    if (ambulanceConfirmed && ambulanceLocation) {
      bounds.extend([ambulanceLocation.lat, ambulanceLocation.lng]);
    }
    map.fitBounds(bounds, { padding: [100, 100], animate: true, duration: 1 });
  };

  const startMission = () => {
    if (!selectedHospital || !userLocation || currentRoutePoints.length === 0) return;
    setNavigationMode(true);
    
    // Force map to recalculate size (fixes rendering issues)
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 100);
    
    // Keep the route visible by fitting bounds with user location emphasized
    const bounds = L.latLngBounds(currentRoutePoints);
    bounds.extend([userLocation.lat, userLocation.lng]);
    bounds.extend([selectedHospital.location.lat, selectedHospital.location.lng]);
    
    // Use maxZoom to prevent zooming out too far
    mapRef.current.fitBounds(bounds, { 
      padding: [150, 150], 
      animate: true, 
      duration: 1.5,
      maxZoom: 15 // Ensure tiles load properly
    });
    
    // Calculate first turn instruction based on route direction
    const nextPoint = currentRoutePoints[Math.min(5, currentRoutePoints.length - 1)];
    const bearing = calculateBearing(userLocation, { lat: nextPoint[0], lng: nextPoint[1] });
    const direction = getDirectionFromBearing(bearing);
    setNextTurn(`Head ${direction} on emergency corridor`);
    
    // Make route even more prominent during navigation
    if (routeLineRef.current) {
      routeLineRef.current.setStyle({
        color: '#22c55e', // Even brighter green for navigation
        weight: 12,
        opacity: 1
      });
    }
    if (routeShadowRef.current) {
      routeShadowRef.current.setStyle({
        color: '#000000',
        weight: 16,
        opacity: 0.8
      });
    }
    
    // Start real-time location tracking for navigation
    if (navigator.geolocation) {
      // Clear any existing interval
      if (navigationIntervalRef.current) {
        clearInterval(navigationIntervalRef.current);
      }
      
      // Update location every 2 seconds during navigation
      navigationIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition((p) => {
          const { latitude, longitude } = p.coords;
          const newLocation = { lat: latitude, lng: longitude };
          setUserLocation(newLocation);
          updateUserMarker(latitude, longitude);
          
          // Update distance and ETA
          if (selectedHospital && currentRoutePoints.length > 0) {
            const distToDestination = calculateDistance(newLocation, selectedHospital.location);
            setRouteDistance(`${distToDestination.toFixed(1)} KM`);
            
            // Find closest point on route for turn instructions
            let closestIndex = 0;
            let minDist = Infinity;
            currentRoutePoints.forEach((point, idx) => {
              const dist = calculateDistance(newLocation, { lat: point[0], lng: point[1] });
              if (dist < minDist) {
                minDist = dist;
                closestIndex = idx;
              }
            });
            
            // Get next turn instruction
            const nextPointIndex = Math.min(closestIndex + 5, currentRoutePoints.length - 1);
            const nextPoint = currentRoutePoints[nextPointIndex];
            const bearing = calculateBearing(newLocation, { lat: nextPoint[0], lng: nextPoint[1] });
            const direction = getDirectionFromBearing(bearing);
            setNextTurn(`Continue ${direction}`);
            
            // Update ETA based on remaining distance (assuming average speed of 40 km/h)
            const timeMin = Math.ceil((distToDestination / 40) * 60);
            setEta(`${timeMin} MINS`);
            
            // DON'T auto-pan - let user freely move the map
            // User can click "Re-center" button if they want to go back to their location
          }
        }, (error) => {
          console.error('Navigation location error:', error);
        });
      }, 3000); // Update every 3 seconds for smoother experience
    }
  };
  
  // Start full ambulance journey (Ambulance → User → Hospital)
  const startFullJourney = () => {
    if (!selectedHospital || !userLocation || !ambulanceLocation || ambulanceRoutePoints.length === 0) return;
    
    setNavigationMode(true);
    setShowAmbulanceTracking(true);
    
    // Force map to recalculate size
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 100);
    
    // Fit bounds to show entire journey
    const allPoints = [...ambulanceRoutePoints, ...hospitalRoutePoints];
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      mapRef.current.fitBounds(bounds, { 
        padding: [100, 100], 
        animate: true, 
        duration: 1.5,
        maxZoom: 14
      });
    }
    
    // Start ambulance movement from ambulance location to user
    startAmbulanceMovement(ambulanceRoutePoints);
  };
  
  // Function to re-center map on user location (user can click button to use this)
  const recenterMap = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
    }
  };
  
  const stopNavigation = () => {
    setNavigationMode(false);
    setShowAmbulanceTracking(false);
    setAmbulanceConfirmed(false);
    setAlertSent(false);
    setWaitingForConfirmation(false);
    setFullRouteMode(false);
    setSelectedHospital(null);
    setDiscoveredHospitals([]);
    setAmbulanceRoutePoints([]);
    setHospitalRoutePoints([]);
    
    if (navigationIntervalRef.current) {
      clearInterval(navigationIntervalRef.current);
      navigationIntervalRef.current = null;
    }
    if (ambulanceIntervalRef.current) {
      clearInterval(ambulanceIntervalRef.current);
      ambulanceIntervalRef.current = null;
    }
    
    // Clear ambulance marker
    if (ambulanceMarkerRef.current && mapRef.current) {
      try {
        mapRef.current.removeLayer(ambulanceMarkerRef.current);
        ambulanceMarkerRef.current = null;
      } catch (e) {}
    }
    
    // Clear all routes
    clearAllRoutes();
    
    // Clear hospital markers
    hospitalMarkersRef.current.forEach(m => {
      try { mapRef.current?.removeLayer(m); } catch(e) {}
    });
    hospitalMarkersRef.current.clear();
    
    // Re-sync location
    syncLocation();
  };
  
  const calculateBearing = (start: {lat: number, lng: number}, end: {lat: number, lng: number}) => {
    const startLat = start.lat * Math.PI / 180;
    const startLng = start.lng * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLng = end.lng * Math.PI / 180;
    
    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  };
  
  const getDirectionFromBearing = (bearing: number) => {
    const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { 
      zoomControl: false, 
      attributionControl: false,
      minZoom: 10,
      maxZoom: 18
    }).setView([12.9716, 77.5946], 13);
    mapRef.current = map;
    
    // Create custom pane for routes (between tiles and markers)
    map.createPane('routePane');
    map.getPane('routePane')!.style.zIndex = '450';
    
    // Use CartoDB dark tiles - reliable dark theme
    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c']
    }).addTo(map);
    
    // Initialize user location
    syncLocation();
    
    return () => {
      // Cleanup on unmount
      if (navigationIntervalRef.current) {
        clearInterval(navigationIntervalRef.current);
      }
      if (ambulanceIntervalRef.current) {
        clearInterval(ambulanceIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    incidents.forEach((inc) => {
      if (incidentMarkersRef.current.has(inc.id)) return;
      
      const emergencyKeywords = ['collision', 'accident', 'crash', 'weapon', 'violence', 'robbery', 'thief', 'women', 'sos', 'fall'];
      const isEmergency = inc.type && emergencyKeywords.some(k => inc.type.toLowerCase().includes(k));
      
      const marker = L.marker([inc.locationCoords?.lat || 12.9716, inc.locationCoords?.lng || 77.5946], {
        icon: L.divIcon({
          className: 'incident-marker',
          html: `<div class="w-10 h-10 ${isEmergency ? 'bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]' : 'bg-amber-500'} rounded-xl border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                   <i class="fa-solid ${isEmergency ? 'fa-car-burst' : 'fa-triangle-exclamation'} text-white text-xs"></i>
                 </div>`
        })
      }).addTo(mapRef.current);
      incidentMarkersRef.current.set(inc.id, marker);
    });
  }, [incidents]);

  return (
    <div className="h-[calc(100vh-140px)] w-full relative overflow-hidden bg-black rounded-[4rem] border-4 border-slate-900 shadow-2xl">
      <div ref={mapContainerRef} className="h-full w-full z-10" />

      {/* NAVIGATION HUD - Car mode only, not ambulance */}
      {navigationMode && selectedHospital && !fullRouteMode && (
        <div className="absolute top-24 right-6 z-[1500] w-72 animate-in slide-in-from-right duration-500">
           <div className="bg-slate-950/95 backdrop-blur-xl border-2 border-emerald-500/50 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-lg animate-pulse">
                    <i className="fa-solid fa-location-arrow transform -rotate-45"></i>
                 </div>
                 <div className="flex-1">
                    <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">{transportMode?.toUpperCase() || 'CAR'}</p>
                    <p className="text-xs font-bold text-white truncate">{nextTurn}</p>
                 </div>
                 <button onClick={stopNavigation} className="bg-slate-900 w-8 h-8 rounded-full text-slate-500 hover:text-white transition-colors flex items-center justify-center">
                    <i className="fa-solid fa-xmark text-sm"></i>
                 </button>
              </div>
              <div className="space-y-2">
                 <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                    <p className="text-[7px] font-black text-slate-500 uppercase">Destination</p>
                    <p className="text-xs font-bold text-white truncate">{selectedHospital.name}</p>
                 </div>
                 <div className="flex gap-2">
                   <div className="flex-1 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                      <p className="text-[7px] font-black text-slate-500 uppercase">Distance</p>
                      <p className="text-sm font-bold text-emerald-500">{routeDistance}</p>
                   </div>
                   <div className="flex-1 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                      <p className="text-[7px] font-black text-slate-500 uppercase">ETA</p>
                      <p className="text-sm font-bold text-white">{eta}</p>
                   </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* HOSPITAL FACILITY OVERLAY - Only show when NOT in full route ambulance mode */}
      {!navigationMode && selectedHospital && !showAmbulanceTracking && (
        <div className="absolute bottom-10 left-10 z-[1500] w-[28rem] animate-in slide-in-from-left duration-500">
           <div className={`bg-slate-950 border-4 ${ambulanceConfirmed ? 'border-red-500/50' : 'border-emerald-500/30'} p-8 rounded-[3.5rem] shadow-2xl space-y-6 relative overflow-hidden`}>
              <div className="h-44 -mx-8 -mt-8 bg-slate-900 relative">
                 <img src={selectedHospital.image} className="w-full h-full object-cover opacity-80" alt="Hospital Hub" />
                 <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent"></div>
                 <button onClick={() => { setSelectedHospital(null); clearAllRoutes(); setFullRouteMode(false); }} className="absolute top-6 right-6 w-10 h-10 bg-black/60 backdrop-blur-md rounded-full text-white flex items-center justify-center hover:bg-black transition-all">
                    <i className="fa-solid fa-xmark"></i>
                 </button>
                 {ambulanceConfirmed && (
                   <div className="absolute top-4 left-4 bg-red-600 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase flex items-center gap-2">
                     <i className="fa-solid fa-truck-medical"></i> Ambulance Mode
                   </div>
                 )}
              </div>
              <div className="space-y-1">
                 <span className="bg-emerald-600/20 text-emerald-500 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Facility Profile Verified</span>
                 <h3 className="text-2xl font-black text-white uppercase leading-none mt-3">{selectedHospital.name}</h3>
              </div>
              <div className="flex items-center gap-3 text-slate-400 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                 <i className="fa-solid fa-location-dot text-emerald-500"></i>
                 <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed line-clamp-2">{selectedHospital.address}</p>
              </div>
              
              {/* Ambulance mode - show both route segments */}
              {ambulanceConfirmed && fullRouteMode ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-950/30 p-3 rounded-xl border-2 border-red-500/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <p className="text-[8px] font-black text-red-400 uppercase">Ambulance → You</p>
                      </div>
                      <p className="text-lg font-black text-white">{ambulanceDistance}</p>
                    </div>
                    <div className="bg-emerald-950/30 p-3 rounded-xl border-2 border-emerald-500/50">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                        <p className="text-[8px] font-black text-emerald-400 uppercase">You → Hospital</p>
                      </div>
                      <p className="text-lg font-black text-white">{routeDistance}</p>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-[8px] font-black text-slate-500 uppercase">Total Trip</p>
                      <p className="text-sm font-black text-white">{totalTripDistance}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-500 uppercase">Est. Time</p>
                      <p className="text-sm font-black text-emerald-500">{totalTripETA}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex gap-4">
                  <div className="flex-1 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Road Distance</p>
                    <p className="text-xs text-emerald-500 font-black">{routeDistance}</p>
                  </div>
                  <div className="flex-1 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Dispatch Mode</p>
                    <p className="text-xs text-white font-black">{transportMode?.toUpperCase() || 'NORMAL'}</p>
                  </div>
                </div>
              )}
              
              <button onClick={ambulanceConfirmed ? startFullJourney : startMission} className={`w-full ${ambulanceConfirmed ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-black py-5 rounded-2xl text-[10px] uppercase tracking-[0.4em] shadow-xl flex items-center justify-center gap-3 transition-all`}>
                 <i className={`fa-solid ${ambulanceConfirmed ? 'fa-truck-medical' : 'fa-bolt'}`}></i> 
                 {ambulanceConfirmed ? 'Start Ambulance Journey' : 'Start Mission Navigation'}
              </button>
           </div>
        </div>
      )}

      {/* DISCOVERY CAROUSEL - Shows hospitals with info cards */}
      {!navigationMode && !showAmbulanceTracking && discoveredHospitals.length > 0 && !selectedHospital && (
        <div className="absolute bottom-10 inset-x-10 z-[1400]">
           {/* Ambulance mode indicator */}
           {ambulanceConfirmed && (
             <div className="mb-4 bg-red-950/80 backdrop-blur-xl px-6 py-3 rounded-2xl border border-red-500/50 inline-flex items-center gap-3">
               <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center animate-pulse">
                 <i className="fa-solid fa-truck-medical text-white text-sm"></i>
               </div>
               <div>
                 <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Ambulance Ready</p>
                 <p className="text-[9px] text-slate-400">Select a hospital to see full route</p>
               </div>
             </div>
           )}
           <div className="flex gap-6 overflow-x-auto pb-6 px-4 no-scrollbar">
           {discoveredHospitals.map((h) => (
             <div 
               key={h.id} 
               onClick={() => handleHospitalSelect(h)}
               className="shrink-0 w-80 bg-slate-950 border-4 border-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer rounded-[3rem] overflow-hidden shadow-2xl"
             >
                <div className="h-36 bg-slate-900 relative">
                   <img src={h.image} className="w-full h-full object-cover opacity-60" alt="Hospital Preview" />
                   <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent"></div>
                   {ambulanceConfirmed && (
                     <div className="absolute top-3 right-3 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase">
                       Ambulance Route
                     </div>
                   )}
                   {/* Road Distance Badge */}
                   <div className="absolute bottom-3 left-3 bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2">
                     <i className="fa-solid fa-route text-[8px]"></i>
                     {h.roadDistance ? `${h.roadDistance} KM` : 'Calculating...'}
                   </div>
                   {h.roadDuration && (
                     <div className="absolute bottom-3 right-3 bg-slate-900/80 text-white text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2">
                       <i className="fa-solid fa-clock text-[8px]"></i>
                       {h.roadDuration} min
                     </div>
                   )}
                </div>
                <div className="p-6 space-y-3">
                   <h4 className="text-lg font-black text-white uppercase truncate">{h.name}</h4>
                   <p className="text-[9px] text-slate-500 uppercase font-bold truncate">{h.address}</p>
                   <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Click to View Routing</p>
                </div>
             </div>
           ))}
           </div>
        </div>
      )}

      {/* SCANNING RADAR */}
      {isScanning && (
        <div className="absolute inset-0 z-[2500] bg-black/70 backdrop-blur-2xl flex flex-col items-center justify-center">
           <div className="relative">
              <div className="w-64 h-64 border-4 border-emerald-500/10 rounded-full animate-ping"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-48 h-48 border-2 border-emerald-500/30 rounded-full animate-spin-slow">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full absolute -top-1 left-1/2 -translate-x-1/2 shadow-[0_0_15px_rgba(16,185,129,1)]"></div>
                 </div>
                 <i className="fa-solid fa-satellite-dish text-6xl text-emerald-500 animate-bounce absolute"></i>
              </div>
           </div>
           <div className="mt-16 text-center">
              <h3 className="text-3xl font-black text-white uppercase tracking-[0.6em] animate-pulse">Scanning 10KM Radius</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-4">Connecting to OpenStreetMap // Calculating Road Distances</p>
           </div>
        </div>
      )}

      {/* DISCOVERY BACK BUTTON */}
      {!navigationMode && !showAmbulanceTracking && discoveredHospitals.length > 0 && (
        <button 
          onClick={() => { 
            setDiscoveredHospitals([]); 
            setSelectedHospital(null);
            setAmbulanceConfirmed(false);
            setFullRouteMode(false);
            setShowAmbulanceTracking(false);
            // Clear ALL route layers
            clearAllRoutes();
            // Clear ambulance marker
            if (ambulanceMarkerRef.current && mapRef.current) {
              try { mapRef.current.removeLayer(ambulanceMarkerRef.current); ambulanceMarkerRef.current = null; } catch(e) {}
            }
            hospitalMarkersRef.current.forEach(m => {
              try { mapRef.current?.removeLayer(m); } catch(e) {}
            });
            hospitalMarkersRef.current.clear();
            setCurrentRoutePoints([]);
            setAmbulanceRoutePoints([]);
            setHospitalRoutePoints([]);
            syncLocation();
          }}
          className="absolute top-10 left-10 z-[1500] bg-slate-950/90 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10 text-white font-black text-[10px] uppercase tracking-[0.4em] flex items-center gap-4 hover:bg-slate-900 transition-all shadow-2xl"
        >
          <i className="fa-solid fa-chevron-left text-emerald-500"></i> Exit Discovery View
        </button>
      )}

      {/* STANDARD TOOLS */}
      {!navigationMode && !isScanning && !showAmbulanceTracking && !ambulanceConfirmed && !fullRouteMode && discoveredHospitals.length === 0 && (
        <div className="absolute bottom-12 right-12 z-[1000] flex flex-col gap-6">
          {/* Emergency Contact Number Display */}
          <div 
            onClick={() => setShowPhoneModal(true)}
            className="bg-slate-950/90 backdrop-blur-xl px-4 py-3 rounded-2xl border border-slate-800 hover:border-green-500/50 cursor-pointer transition-all group mb-2"
          >
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">WhatsApp Alert</p>
            {emergencyPhone ? (
              <p className="text-sm font-bold text-green-500 flex items-center gap-2">
                <i className="fa-brands fa-whatsapp text-sm"></i>
                {emergencyPhone}
              </p>
            ) : (
              <p className="text-sm font-bold text-red-400 flex items-center gap-2">
                <i className="fa-solid fa-exclamation-triangle text-[10px]"></i>
                Not Set - Tap to Add
              </p>
            )}
            <p className="text-[8px] text-slate-600 group-hover:text-slate-400 mt-1">Tap to edit</p>
          </div>
          
          <button onClick={handleSOSClick} className="w-24 h-24 rounded-full bg-red-600 shadow-[0_0_60px_rgba(220,38,38,0.7)] flex flex-col items-center justify-center text-white border-4 border-white/20 hover:scale-110 transition-all">
            <i className="fa-solid fa-truck-medical text-3xl mb-1"></i>
            <span className="text-[10px] font-black uppercase tracking-widest">SOS</span>
          </button>
          <button onClick={() => setShowReportModal(true)} className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-all border border-blue-500/30"><i className="fa-solid fa-plus text-2xl"></i></button>
          <button onClick={syncLocation} className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-slate-400 shadow-2xl hover:scale-110 transition-all border border-slate-800"><i className="fa-solid fa-location-crosshairs text-2xl"></i></button>
        </div>
      )}

      {/* FLOATING RE-CENTER BUTTON DURING NAVIGATION */}
      {(navigationMode || showAmbulanceTracking) && (
        <button 
          onClick={recenterMap} 
          className="absolute bottom-12 right-12 z-[1500] w-16 h-16 bg-emerald-600 hover:bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-all border-2 border-white/20"
          title="Re-center on my location"
        >
          <i className="fa-solid fa-crosshairs text-2xl"></i>
        </button>
      )}

      {/* SOS SELECTION MODAL */}
      {showSOSModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-red-950/70 backdrop-blur-2xl" onClick={() => setShowSOSModal(false)}></div>
          <div className="relative bg-slate-950 border-4 border-red-600/50 p-16 rounded-[5rem] w-full max-w-2xl space-y-12 text-center shadow-2xl">
            <div className="space-y-4">
               <div className="w-24 h-24 bg-red-600 rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl">
                  <i className="fa-solid fa-tower-broadcast text-4xl text-white animate-pulse"></i>
               </div>
               <h3 className="text-5xl font-black text-white uppercase tracking-tighter leading-none">Emergency Hub Scan</h3>
               <p className="text-slate-400 font-bold max-w-md mx-auto">Select transport mode for emergency response.</p>
               {emergencyPhone && (
                 <p className="text-[10px] text-emerald-500 font-bold">
                   <i className="fa-solid fa-phone mr-2"></i>Alert will be sent to: {emergencyPhone}
                 </p>
               )}
            </div>
            <div className="grid grid-cols-2 gap-8">
               <button onClick={() => handleSOSScan('Car')} className="p-12 bg-slate-900 border-2 border-slate-800 hover:border-blue-600 rounded-[3rem] space-y-6 group transition-all">
                  <div className="w-20 h-20 bg-slate-950 rounded-2xl mx-auto flex items-center justify-center group-hover:scale-110 transition-transform">
                     <i className="fa-solid fa-car text-5xl text-slate-700 group-hover:text-blue-500"></i>
                  </div>
                  <p className="text-xs font-black uppercase text-slate-500 group-hover:text-white tracking-widest">Private Vehicle</p>
                  <p className="text-[9px] text-slate-600">Find hospitals yourself</p>
               </button>
               <button onClick={handleAmbulanceMode} className="p-12 bg-slate-900 border-2 border-slate-800 hover:border-red-600 rounded-[3rem] space-y-6 group transition-all relative overflow-hidden">
                  <div className="absolute inset-0 bg-red-600/5 group-hover:bg-red-600/10 transition-all"></div>
                  <div className="w-20 h-20 bg-slate-950 rounded-2xl mx-auto flex items-center justify-center group-hover:scale-110 transition-transform relative">
                     <i className="fa-solid fa-truck-medical text-5xl text-slate-700 group-hover:text-red-500"></i>
                  </div>
                  <p className="text-xs font-black uppercase text-slate-500 group-hover:text-white tracking-widest relative">Ambulance SOS</p>
                  <p className="text-[9px] text-red-400 relative">Sends alert & dispatches ambulance</p>
               </button>
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={() => { setShowSOSModal(false); setShowPhoneModal(true); }} className="text-slate-500 font-black uppercase text-[10px] tracking-[0.3em] hover:text-emerald-500 flex items-center gap-2">
                <i className="fa-solid fa-phone-flip"></i> Change Phone
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={() => setShowSOSModal(false)} className="text-slate-600 font-black uppercase text-[10px] tracking-[0.5em] hover:text-white">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* PHONE NUMBER MODAL */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" onClick={() => setShowPhoneModal(false)}></div>
          <div className="relative bg-slate-950 border-4 border-green-600/50 p-16 rounded-[5rem] w-full max-w-xl space-y-10 text-center shadow-2xl">
            <div className="space-y-4">
               <div className="w-20 h-20 bg-green-600 rounded-[1.5rem] mx-auto flex items-center justify-center shadow-2xl">
                  <i className="fa-brands fa-whatsapp text-4xl text-white"></i>
               </div>
               <h3 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">WhatsApp Alert</h3>
               <p className="text-slate-400 font-bold max-w-sm mx-auto text-sm">Enter the WhatsApp number to send emergency SOS alert with your live location.</p>
            </div>
            <div className="space-y-6">
              <div className="relative">
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full bg-slate-900 border-2 border-slate-800 focus:border-green-500 rounded-2xl px-6 py-5 text-2xl text-white text-center font-bold tracking-widest outline-none transition-all"
                  maxLength={15}
                />
                <i className="fa-brands fa-whatsapp absolute right-6 top-1/2 -translate-y-1/2 text-green-600 text-2xl"></i>
              </div>
              <p className="text-[10px] text-slate-500">WhatsApp will open with your GPS location pre-filled</p>
            </div>
            <div className="flex flex-col gap-4">
              <button 
                onClick={savePhoneAndProceed}
                disabled={!emergencyPhone}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-5 rounded-2xl text-[11px] uppercase tracking-[0.4em] shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50"
              >
                <i className="fa-brands fa-whatsapp text-lg"></i> Open WhatsApp SOS
              </button>
              <button onClick={() => setShowPhoneModal(false)} className="text-slate-600 font-black uppercase text-[10px] tracking-[0.5em] hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* WAITING FOR CONFIRMATION SCREEN */}
      {waitingForConfirmation && (
        <div className="fixed inset-0 z-[3500] flex items-center justify-center bg-red-950/80 backdrop-blur-2xl">
          <div className="text-center space-y-10 max-w-lg mx-auto p-8">
            <div className="relative">
              <div className="w-48 h-48 border-4 border-green-500/30 rounded-full animate-ping mx-auto"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-green-600 rounded-full flex items-center justify-center shadow-[0_0_100px_rgba(34,197,94,0.8)]">
                  <i className="fa-brands fa-whatsapp text-5xl text-white animate-pulse"></i>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-4xl font-black text-white uppercase tracking-[0.3em] animate-pulse">WhatsApp Opened!</h3>
              <p className="text-green-300 font-bold text-lg">Emergency message ready for {emergencyPhone}</p>
              <p className="text-slate-400 text-sm">Send the message in WhatsApp, then confirm below.</p>
              <p className="text-slate-500 text-xs mt-4">The message contains your live GPS location.</p>
            </div>
            
            {/* Confirmation Checkbox */}
            <div 
              onClick={() => setWhatsappSentConfirmed(!whatsappSentConfirmed)}
              className={`flex items-center gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${whatsappSentConfirmed ? 'bg-green-900/50 border-green-500' : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'}`}
            >
              <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${whatsappSentConfirmed ? 'bg-green-500 border-green-500' : 'border-slate-500'}`}>
                {whatsappSentConfirmed && <i className="fa-solid fa-check text-white text-lg"></i>}
              </div>
              <p className={`font-bold text-left ${whatsappSentConfirmed ? 'text-green-300' : 'text-slate-400'}`}>
                I have sent the WhatsApp message
              </p>
            </div>
            
            <div className="flex flex-col gap-4">
              <button 
                onClick={handleUserAcceptAlert}
                disabled={!whatsappSentConfirmed}
                className={`w-full ${whatsappSentConfirmed ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 cursor-not-allowed'} text-white font-black py-5 rounded-2xl text-sm uppercase tracking-[0.3em] shadow-xl flex items-center justify-center gap-3 transition-all`}
              >
                <i className="fa-solid fa-check-circle text-xl"></i> Accept & Dispatch Ambulance
              </button>
              <button 
                onClick={() => { setWaitingForConfirmation(false); setAlertSent(false); setWhatsappSentConfirmed(false); }}
                className="text-slate-500 font-black uppercase text-[10px] tracking-[0.3em] hover:text-white"
              >
                Cancel SOS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOSPITAL SELECTION AFTER ACCEPTING (Ambulance mode) */}
      {ambulanceConfirmed && !showAmbulanceTracking && discoveredHospitals.length > 0 && (
        <div className="absolute top-6 inset-x-6 z-[2000]">
          <div className="max-w-2xl mx-auto bg-slate-950/95 backdrop-blur-xl border-2 border-emerald-500/50 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                <i className="fa-solid fa-hospital text-white text-xl"></i>
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Step 2</p>
                <h3 className="text-lg font-black text-white">Select Hospital Destination</h3>
              </div>
            </div>
            <p className="text-slate-400 text-sm mb-2">
              <i className="fa-solid fa-truck-medical text-red-500 mr-2"></i>
              Ambulance ready at location. Click a hospital on the map to see the full route.
            </p>
          </div>
        </div>
      )}

      {/* FULL ROUTE PREVIEW (Ambulance → Home → Hospital) - Bottom left panel */}
      {showAmbulanceTracking && fullRouteMode && selectedHospital && !navigationMode && (
        <div className="absolute bottom-10 left-10 z-[1500] w-[26rem] animate-in slide-in-from-left duration-500">
          <div className="bg-slate-950 border-4 border-emerald-500/50 rounded-[3rem] p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-emerald-600 rounded-xl flex items-center justify-center text-white text-xl shadow-xl">
                  <i className="fa-solid fa-route"></i>
                </div>
                <div>
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em]">Full Route</p>
                  <h3 className="text-sm font-black text-white uppercase">{selectedHospital.name}</h3>
                </div>
              </div>
              <button onClick={stopNavigation} className="bg-slate-900 w-8 h-8 rounded-full text-slate-500 hover:text-white transition-colors flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            
            {/* Route segments */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-red-950/30 p-3 rounded-xl border-2 border-red-500/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <p className="text-[8px] font-black text-red-400 uppercase">Ambulance → You</p>
                </div>
                <p className="text-lg font-black text-white">{ambulanceDistance}</p>
              </div>
              <div className="bg-emerald-950/30 p-3 rounded-xl border-2 border-emerald-500/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                  <p className="text-[8px] font-black text-emerald-400 uppercase">You → Hospital</p>
                </div>
                <p className="text-lg font-black text-white">{routeDistance}</p>
              </div>
            </div>
            
            {/* Total */}
            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 mb-4 flex justify-between items-center">
              <div>
                <p className="text-[8px] font-black text-slate-500 uppercase">Total Trip</p>
                <p className="text-sm font-black text-white">{totalTripDistance}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-500 uppercase">Est. Time</p>
                <p className="text-sm font-black text-emerald-500">{totalTripETA}</p>
              </div>
            </div>
            
            {/* Start Button */}
            <button 
              onClick={startFullJourney}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-[0.3em] shadow-xl flex items-center justify-center gap-2 transition-all"
            >
              <i className="fa-solid fa-play"></i> Start Ambulance Journey
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE NAVIGATION HUD (during ambulance movement) - Right side panel */}
      {navigationMode && fullRouteMode && (
        <div className="absolute top-24 right-6 z-[1500] w-72 animate-in slide-in-from-right duration-500">
          <div className="bg-slate-950/95 backdrop-blur-xl border-2 border-emerald-500/50 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white text-lg animate-pulse">
                <i className="fa-solid fa-truck-medical"></i>
              </div>
              <div className="flex-1">
                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Ambulance Active</p>
                <p className="text-xs font-bold text-white truncate">{nextTurn}</p>
              </div>
              <button onClick={stopNavigation} className="bg-slate-900 w-8 h-8 rounded-full text-slate-500 hover:text-white transition-colors flex items-center justify-center">
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 bg-red-950/40 p-2 rounded-lg border border-red-900/50">
                  <p className="text-[7px] font-black text-red-400 uppercase">To Pickup</p>
                  <p className="text-sm font-bold text-white">{ambulanceDistance}</p>
                </div>
                <div className="flex-1 bg-emerald-950/40 p-2 rounded-lg border border-emerald-900/50">
                  <p className="text-[7px] font-black text-emerald-400 uppercase">To Hospital</p>
                  <p className="text-sm font-bold text-white">{routeDistance}</p>
                </div>
              </div>
              <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800 flex justify-between items-center">
                <span className="text-[8px] font-black text-slate-500 uppercase">ETA</span>
                <span className="text-sm font-bold text-emerald-500">{eta}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL REPORT */}
      {showReportModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-8">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowReportModal(false)}></div>
          <div className="relative bg-slate-950 border-4 border-slate-900 p-16 rounded-[5rem] w-full max-w-xl space-y-12 shadow-2xl text-center">
            <h3 className="text-5xl font-black text-white uppercase tracking-tighter">Tactical Entry</h3>
            <div className="grid grid-cols-1 gap-6">
               <button onClick={() => { setShowReportModal(false); reportFileInputRef.current?.click(); }} className="p-10 bg-slate-900 border-2 border-slate-800 hover:border-blue-600 rounded-[2.5rem] flex justify-between items-center text-white font-black uppercase tracking-widest group transition-all">
                  Log Collision <i className="fa-solid fa-car-burst text-slate-700 group-hover:text-blue-500"></i>
               </button>
               <button onClick={() => { setShowReportModal(false); reportFileInputRef.current?.click(); }} className="p-10 bg-slate-900 border-2 border-slate-800 hover:border-amber-600 rounded-[2.5rem] flex justify-between items-center text-white font-black uppercase tracking-widest group transition-all">
                  Log Traffic <i className="fa-solid fa-traffic-light text-slate-700 group-hover:text-amber-500"></i>
               </button>
            </div>
          </div>
        </div>
      )}

      <input type="file" ref={reportFileInputRef} className="hidden" accept="image/*" />

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* Hospital marker styles */
        .hosp-marker {
          z-index: 1000 !important;
        }
        
        /* User marker on top */
        .user-marker {
          z-index: 2000 !important;
        }
        
        /* Ambulance marker highest priority */
        .ambulance-marker {
          z-index: 2500 !important;
        }
        
        /* Route animation for better visibility */
        @keyframes route-dash {
          0% { 
            stroke-dashoffset: 0;
          }
          100% { 
            stroke-dashoffset: 40;
          }
        }
        
        @keyframes route-glow {
          0%, 100% { 
            opacity: 0.8;
            filter: drop-shadow(0 0 8px #10b981);
          }
          50% { 
            opacity: 1;
            filter: drop-shadow(0 0 16px #10b981);
          }
        }
        
        .route-line-animated path {
          stroke-dasharray: 20, 10;
          animation: route-dash 1.5s linear infinite;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 10px #10b981);
        }
        
        .ambulance-route-animated path {
          stroke-dasharray: 15, 8;
          animation: route-dash 1s linear infinite;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 0 12px #ef4444);
        }
        
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .animate-spin-slow { 
          animation: spin-slow 4s linear infinite; 
        }
        
        /* Ensure leaflet panes are ordered correctly */
        .leaflet-pane {
          z-index: auto;
        }
        
        .leaflet-overlay-pane {
          z-index: 400;
        }
        
        .leaflet-marker-pane {
          z-index: 600;
        }
      `}</style>
    </div>
  );
};

export default TacticalMap;
