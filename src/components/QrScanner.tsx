"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { NotFoundException, ChecksumException, FormatException, Result, Exception } from "@zxing/library";
import { QrCode, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface QrScannerProps {
  onScan: (data: Uint8Array) => void;
  className?: string;
}

export function QrScanner({ onScan, className }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const codeReaderRef = useRef(new BrowserQRCodeReader(undefined, {
      hints: {
        TRY_HARDER: true,
      },
  }));

  const [error, setError] = useState<string | null>(null);
  const [scanComplete, setScanComplete] = useState(false);

  const stopScan = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
  }, []);

  const startScan = useCallback(async () => {
    if (!videoRef.current) return;
    
    stopScan(); 
    setError(null);
    setScanComplete(false);

    const callback = (result: Result | undefined, err: Exception | undefined) => {
        if (result) {
          stopScan();
          setScanComplete(true);
          const rawBytes = result.getRawBytes();
          if (rawBytes && rawBytes.length > 0) {
            onScan(rawBytes);
          }
        }
        
        if (err && !(err instanceof NotFoundException || err instanceof ChecksumException || err instanceof FormatException)) {
          console.error("An unexpected QR Scan Error occurred:", err);
          setError("An unexpected error occurred during scanning.");
          setScanComplete(true);
          stopScan();
        }
    };

    try {
      // Try with high-res constraints first for better dense QR code scanning
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment', // prefer back camera
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if(videoRef.current) {
        videoRef.current.srcObject = stream;
        // The decodeFromStream method is more flexible and allows us to use custom stream constraints.
        const newControls = await codeReaderRef.current.decodeFromStream(stream, videoRef.current, callback);
        controlsRef.current = newControls;
      }

    } catch (highResError) {
      console.warn("High-resolution stream failed, falling back to default.", highResError);
      // Fallback to default camera settings if high-res fails
      try {
        const newControls = await codeReaderRef.current.decodeFromVideoDevice(undefined, videoRef.current, callback);
        controlsRef.current = newControls;
      } catch (err: any) {
        console.error("Camera access failed: ", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError("Camera permission was denied. Please grant permission in your browser settings and try again.");
        } else {
          setError("Could not access camera. It might be in use by another application or not available.");
        }
        setScanComplete(true);
      }
    }
  }, [onScan, stopScan]);


  useEffect(() => {
    startScan();
    return () => {
      stopScan();
    };
  }, [startScan, stopScan]);

  const handleRescan = () => {
    startScan();
  }

  return (
    <div className={cn("relative w-full aspect-square max-w-md mx-auto rounded-lg overflow-hidden border-2 border-dashed border-primary/50 bg-card flex items-center justify-center", className)}>
      <video ref={videoRef} className={cn("w-full h-full object-cover", { "hidden": !!error })} autoPlay muted playsInline />
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-destructive bg-background">
          <VideoOff className="w-16 h-16 mb-4" />
          <p className="font-bold mb-2">Camera Error</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={handleRescan} className="mt-4">Try Again</Button>
        </div>
      )}

      {!scanComplete && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 pointer-events-none">
          <div className="w-2/3 h-2/3 border-4 border-accent rounded-lg opacity-75 animate-pulse" />
          <p className="mt-4 text-primary-foreground font-semibold">Scanning for QR Code...</p>
        </div>
      )}

       {scanComplete && !error && (
         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
           <QrCode className="w-24 h-24 text-accent" />
           <p className="mt-4 text-lg font-bold text-primary-foreground">Scan Complete!</p>
           <Button variant="link" onClick={handleRescan} className="mt-2 text-primary">Scan another code</Button>
         </div>
       )}
    </div>
  );
}
