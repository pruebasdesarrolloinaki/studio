"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { QrCode, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface QrScannerProps {
  onScan: (data: string) => void;
  className?: string;
}

export function QrScanner({ onScan, className }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();

  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const tick = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
        if (canvasContext) {
          canvas.height = video.videoHeight;
          canvas.width = video.videoWidth;
          canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth",
            });

            if (code && code.data) {
              onScan(code.data);
              setIsScanning(false);
              return; 
            }
          } catch(e) {
            console.error(e);
          }
        }
      }
    }
    animationFrameId.current = requestAnimationFrame(tick);
  }, [onScan]);

  const startScanProcess = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setIsScanning(true);
      }
    } catch (err) {
      console.error("Error accessing camera: ", err);
      setError("Could not access camera. Please grant permission and try again.");
    }
  }, []);

  useEffect(() => {
    if (isScanning) {
        animationFrameId.current = requestAnimationFrame(tick);
    } else {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
    }
    return () => {
        if(animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
    }
  }, [isScanning, tick]);

  useEffect(() => {
    startScanProcess();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startScanProcess]);

  return (
    <div className={cn("relative w-full aspect-square max-w-md mx-auto rounded-lg overflow-hidden border-2 border-dashed border-primary/50 bg-card flex items-center justify-center", className)}>
      <video ref={videoRef} className={cn("w-full h-full object-cover", { "hidden": !isScanning && !error })} />
      <canvas ref={canvasRef} className="hidden" />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-destructive bg-background">
          <VideoOff className="w-16 h-16 mb-4" />
          <p className="font-bold mb-2">Camera Error</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={startScanProcess} className="mt-4">Try Again</Button>
        </div>
      )}
      {isScanning && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 pointer-events-none">
          <div className="w-2/3 h-2/3 border-4 border-accent rounded-lg opacity-75 animate-pulse" />
          <p className="mt-4 text-primary-foreground font-semibold">Scanning for QR Code...</p>
        </div>
      )}
       {!isScanning && !error && (
         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
           <QrCode className="w-24 h-24 text-accent" />
           <p className="mt-4 text-lg font-bold text-primary-foreground">Scan Complete!</p>
           <Button variant="link" onClick={() => setIsScanning(true)} className="mt-2 text-primary">Scan another code</Button>
         </div>
       )}
    </div>
  );
}
