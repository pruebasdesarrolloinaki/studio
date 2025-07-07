"use client";

import { useEffect, useState } from "react";
import { QrCode, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DecodeHintType, useZxing } from "react-zxing";

interface QrScannerProps {
  onScan: (data: string) => void;
  className?: string;
}

export function QrScanner({ onScan, className }: QrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanComplete, setScanComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const hints = new Map();
  hints.set(DecodeHintType.CHARACTER_SET, 'ISO-8859-1');

  const { ref, torch } = useZxing({
    hints,
    onDecodeResult(result) {
      onScan(result.getText());
      setScanComplete(true);
    },
    onError(error) {
      console.error("ZXing error:", error);
      const errorObj = error as Error;
      if (errorObj.name === 'NotAllowedError' || errorObj.name === 'PermissionDeniedError') {
        setError("Camera permission was denied. Please grant permission in your browser settings and try again.");
      } else {
        setError(`Could not access camera: ${errorObj.message || errorObj}`);
      }
    },
    paused: scanComplete,
    constraints: {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    },
    timeBetweenDecodingAttempts: 300
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const handleRescan = () => {
    setScanComplete(false);
    setError(null);
  };

  return (
    <div className={cn("relative w-full aspect-square max-w-md mx-auto rounded-lg overflow-hidden border-2 border-dashed border-primary/50 bg-card flex items-center justify-center", className)}>
      <video ref={ref as React.RefObject<HTMLVideoElement>} className="w-full h-full object-cover" />
      
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-card/90 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
          <p className="text-primary font-medium">Initializing scanner...</p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-destructive bg-background">
          <VideoOff className="w-16 h-16 mb-4" />
          <p className="font-bold mb-2">Camera Error</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={handleRescan} className="mt-4">Try Again</Button>
        </div>
      )}

      {!scanComplete && !error && !isLoading && (
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
      
      {torch.isAvailable && !scanComplete && !error && !isLoading && (
        <Button 
          variant="outline" 
          size="sm" 
          className="absolute bottom-4 right-4 bg-background/80"
          onClick={() => torch.isOn ? torch.off() : torch.on()}
        >
          {torch.isOn ? "Turn off torch" : "Turn on torch"}
        </Button>
      )}
    </div>
  );
}
