"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { QrCode, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useZxing } from "react-zxing";

interface QrScannerProps {
  onScan: (data: Uint8Array) => void;
  className?: string;
}

export function QrScanner({ onScan, className }: QrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [scanComplete, setScanComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  
  // Función para convertir una cadena hexadecimal a Uint8Array
  const hexStringToUint8Array = useCallback((hexString: string): Uint8Array => {
    // Eliminar espacios y asegurarse de que la longitud sea par
    const cleanHexString = hexString.replace(/\s/g, '');
    if (cleanHexString.length % 2 !== 0) {
      throw new Error('La cadena hexadecimal debe tener una longitud par');
    }
    
    const byteArray = new Uint8Array(cleanHexString.length / 2);
    for (let i = 0; i < cleanHexString.length; i += 2) {
      byteArray[i / 2] = parseInt(cleanHexString.substring(i, i + 2), 16);
    }
    
    return byteArray;
  }, []);
  
  // Función para intentar convertir el resultado del escaneo a Uint8Array
  const processQrResult = useCallback((text: string) => {
    try {
      // Intentar interpretar como datos binarios (representados en hexadecimal)
      if (/^[0-9A-Fa-f\s]+$/.test(text)) {
        // Es una cadena hexadecimal
        const binaryData = hexStringToUint8Array(text);
        onScan(binaryData);
        return true;
      } else {
        // Intentar convertir directamente a Uint8Array (cada carácter como un byte)
        const binaryData = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
          binaryData[i] = text.charCodeAt(i);
        }
        onScan(binaryData);
        return true;
      }
    } catch (err) {
      console.error("Error processing QR code data:", err);
      return false;
    }
  }, [hexStringToUint8Array, onScan]);

  // Configurar el escáner ZXing
  const { ref, torch } = useZxing({
    onDecodeResult(result) {
      const text = result.getText();
      setResult(text);
      console.log("QR Code detected!", text);
      
      // Procesar el resultado y convertirlo a Uint8Array
      if (processQrResult(text)) {
        setScanComplete(true);
      }
    },
    onError(error) {
      console.error("ZXing error:", error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setError("Camera permission was denied. Please grant permission in your browser settings and try again.");
      } else {
        setError(`Could not access camera: ${error.message || error}`);
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

  // Efecto para manejar el estado de carga
  useEffect(() => {
    // Simular un breve tiempo de carga para la inicialización
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const handleRescan = () => {
    setScanComplete(false);
    setResult(null);
    setError(null);
  };

  return (
    <div className={cn("relative w-full aspect-square max-w-md mx-auto rounded-lg overflow-hidden border-2 border-dashed border-primary/50 bg-card flex items-center justify-center", className)}>
      {/* Contenedor para la cámara */}
      <video ref={ref} className="w-full h-full object-cover" />
      
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-card/90 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4"></div>
          <p className="text-primary font-medium">Inicializando escáner...</p>
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
      
      {/* Control de linterna si está disponible */}
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