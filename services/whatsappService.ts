// WhatsApp Service - Direct WhatsApp Web/App integration (no external API needed)

export interface WhatsAppResult {
  success: boolean;
  message: string;
}

// Send WhatsApp message by opening WhatsApp with pre-filled message
export const sendWhatsApp = (
  toPhone: string,
  messageBody: string
): WhatsAppResult => {
  // Format phone number for WhatsApp
  let formattedPhone = toPhone.replace(/\s+/g, '').replace(/-/g, '');
  if (!formattedPhone.startsWith('+')) {
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+91' + formattedPhone.substring(1);
    } else {
      formattedPhone = '+91' + formattedPhone;
    }
  }
  // Remove + for WhatsApp URL
  formattedPhone = formattedPhone.replace('+', '');

  // Create WhatsApp URL
  const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(messageBody)}`;
  
  console.log(`Opening WhatsApp to send message to: ${formattedPhone}`);
  
  // Open WhatsApp in new tab
  window.open(whatsappUrl, '_blank');
  
  return {
    success: true,
    message: 'WhatsApp opened successfully!'
  };
};

// Send Emergency SOS via WhatsApp
export const sendEmergencySOS = (
  toPhone: string,
  location: { lat: number; lng: number }
): WhatsAppResult => {
  const mapsLink = `https://maps.google.com/maps?q=${location.lat},${location.lng}`;
  
  const message = `🚨 *EMERGENCY SOS ALERT* 🚨

I need immediate help!

📍 *My Location:*
${mapsLink}

⏰ Time: ${new Date().toLocaleString()}

This is an automated emergency alert from Sentinel AI Public Safety Dashboard.

Please send help immediately!`;

  return sendWhatsApp(toPhone, message);
};
