"use client";

import { useState, useMemo } from "react";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Binary, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DecodedQrData {
  header: {
    magicConstant: number;
    version: number;
    country: string;
    signerId: string;
    issueDate: string;
    signDate: string;
    docType: number;
    docCategory: number;
  };
  tlvData: Array<{
    tag: number;
    length: number;
    value: string;
  }>;
  signature?: {
    tag: number;
    length: number;
    value: string;
  };
  rawBytes: Uint8Array;
}

export default function Home() {
  const [scannedData, setScannedData] = useState<Uint8Array | null>(null);
  const [decodedData, setDecodedData] = useState<DecodedQrData | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();

  const decodeQrData = (data: Uint8Array): DecodedQrData | null => {
    try {
      // Verificar longitud mínima para la cabecera
      if (data.length < 12) {
        throw new Error("QR data too short to be a valid ICAO 9303 SDV format");
      }

      let offset = 0;
      
      // Leer Magic Constant (normalmente 0xDC, pero podría ser diferente)
      const magicConstant = data[offset++];
      // No validamos estrictamente la constante mágica para permitir diferentes formatos
      // Simplemente registramos el valor encontrado
      console.log(`Magic constant found: 0x${magicConstant.toString(16).toUpperCase()}`);
      
      // Comprobar si estamos ante un formato conocido
      const isICAO9303 = magicConstant === 0xDC;
      const isAlternateFormat = magicConstant === 0x40;
      
      console.log(`Is ICAO 9303 format: ${isICAO9303}`);
      console.log(`Is alternate format (0x40): ${isAlternateFormat}`);
      
      // Leer versión (normalmente 0x03 para versión 4, pero podría ser diferente)
      const version = data[offset++];
      console.log(`Version found: 0x${version.toString(16).toUpperCase()}`);
      
      // Leer país expedidor ("ES")
      const countryCode = String.fromCharCode(data[offset++], data[offset++]);
      
      // Leer identificador del firmante
      // Formato: 2 letras país + 2 caracteres entidad + 2 dígitos tamaño + referencia certificado
      let signerIdStr = "";
      
      // 2 letras país
      signerIdStr += String.fromCharCode(data[offset++], data[offset++]);
      
      // 2 caracteres entidad
      signerIdStr += String.fromCharCode(data[offset++], data[offset++]);
      
      // 2 dígitos tamaño
      const certRefSizeStr = String.fromCharCode(data[offset++], data[offset++]);
      const certRefSize = parseInt(certRefSizeStr, 10);
      signerIdStr += certRefSizeStr;
      
      // Referencia certificado (cadena hexadecimal)
      let certRefHex = "";
      for (let i = 0; i < certRefSize; i++) {
        certRefHex += data[offset++].toString(16).padStart(2, '0').toUpperCase();
      }
      signerIdStr += certRefHex;
      
      // Leer fecha de emisión (3 bytes)
      const issueDate = formatDate(data.slice(offset, offset + 3));
      offset += 3;
      
      // Leer fecha de firma (3 bytes)
      const signDate = formatDate(data.slice(offset, offset + 3));
      offset += 3;
      
      // Leer referencia a la definición de los elementos del documento
      const docType = data[offset++];
      
      // Leer categoría de tipo de documento
      const docCategory = data[offset++];
      
      // Crear objeto de cabecera
      const header = {
        magicConstant,
        version,
        country: countryCode,
        signerId: signerIdStr,
        issueDate,
        signDate,
        docType,
        docCategory
      };
      
      // Procesar TLVs (Tag-Length-Value)
      const tlvData: Array<{ tag: number; length: number; value: string }> = [];
      let signature;
      
      // Mientras haya datos por procesar
      while (offset < data.length) {
        // Leer tag
        const tag = data[offset++];
        
        // Leer longitud
        let length = 0;
        if (version === 0x03) { // Versión 4 permite longitudes mayores a 254 bytes
          if (offset >= data.length) break;
          
          const firstLengthByte = data[offset++];
          if (firstLengthByte < 0x80) {
            length = firstLengthByte;
          } else {
            const numLengthBytes = firstLengthByte & 0x7F;
            length = 0;
            for (let i = 0; i < numLengthBytes; i++) {
              if (offset >= data.length) break;
              length = (length << 8) | data[offset++];
            }
          }
        } else {
          if (offset >= data.length) break;
          length = data[offset++];
        }
        
        // Verificar si hay suficientes bytes para el valor
        if (offset + length > data.length) break;
        
        // Leer valor
        const valueBytes = data.slice(offset, offset + length);
        offset += length;
        
        // Convertir a hexadecimal para visualización
        const valueHex = Array.from(valueBytes)
          .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
          .join('');
        
        // Si es el último TLV, asumimos que es la firma
        if (offset >= data.length) {
          signature = { tag, length, value: valueHex };
        } else {
          tlvData.push({ tag, length, value: valueHex });
        }
      }
      
      return {
        header,
        tlvData,
        signature,
        rawBytes: data
      };
    } catch (error) {
      console.error("Error decoding QR data:", error);
      toast({
        variant: "destructive",
        title: "Decoding Error",
        description: error instanceof Error ? error.message : "Failed to decode QR data",
      });
      return null;
    }
  };
  
  // Función auxiliar para formatear fechas desde 3 bytes
  const formatDate = (bytes: Uint8Array): string => {
    if (bytes.length !== 3) return "Invalid date";
    
    // Formato: YYMMDD
    const year = 2000 + bytes[0]; // Asumimos años 2000+
    const month = bytes[1];
    const day = bytes[2];
    
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };

  const handleScan = (data: Uint8Array) => {
    setScannedData(data);
    // Siempre guardamos los bytes crudos
    console.log("Scanned QR data length:", data.length);
    console.log("First 10 bytes:", Array.from(data.slice(0, 10)).map(b => `0x${b.toString(16).padStart(2, '0')}`));
    
    // Intentamos decodificar, pero no nos preocupamos si falla
    try {
      const decoded = decodeQrData(data);
      setDecodedData(decoded);
    } catch (error) {
      console.error("Error decoding QR data:", error);
      setDecodedData(null);
      // Mostramos el error en la consola pero no interrumpimos la experiencia del usuario
      toast({
        variant: "default",
        title: "Mostrando bytes sin decodificar",
        description: "Los datos no siguen el formato ICAO 9303 SDV esperado, pero puedes ver los bytes crudos.",
      });
    }
  };

  const byteArrayString = useMemo(() => {
    if (!scannedData) return "";
    try {
      // Convert each byte to a zero-padded hex string with a "0x" prefix.
      const hexString = Array.from(scannedData)
        .map(byte => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`)
        .join(", ");
      return `[${hexString}]`;
    } catch (error) {
      console.error("Error converting to byte array string:", error);
      toast({
        variant: "destructive",
        title: "Conversion Error",
        description: "Could not display byte array from scanned data.",
      });
      return "Error: Could not display data.";
    }
  }, [scannedData, toast]);
  
  // Formato alternativo para visualizar los bytes en formato tabla
  const byteArrayTable = useMemo(() => {
    if (!scannedData) return "";
    try {
      let result = "Offset | 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F | ASCII\n";
      result += "-------|-------------------------------------------------|----------------\n";
      
      for (let i = 0; i < scannedData.length; i += 16) {
        // Offset en hexadecimal
        const offset = i.toString(16).toUpperCase().padStart(6, '0');
        result += `${offset} | `;
        
        // Bytes en hexadecimal
        const rowBytes = [];
        const rowAscii = [];
        
        for (let j = 0; j < 16; j++) {
          if (i + j < scannedData.length) {
            const byte = scannedData[i + j];
            rowBytes.push(byte.toString(16).toUpperCase().padStart(2, '0'));
            
            // Convertir a ASCII si es imprimible, o punto si no lo es
            if (byte >= 32 && byte <= 126) {
              rowAscii.push(String.fromCharCode(byte));
            } else {
              rowAscii.push('.');
            }
          } else {
            rowBytes.push('  ');
            rowAscii.push(' ');
          }
        }
        
        result += rowBytes.join(' ') + ' | ' + rowAscii.join('') + '\n';
      }
      
      return result;
    } catch (error) {
      console.error("Error converting to byte array table:", error);
      return "Error: Could not display data in table format.";
    }
  }, [scannedData]);
  
  const decodedDataString = useMemo(() => {
    if (!decodedData) return "";
    try {
      return JSON.stringify(decodedData, (key, value) => {
        // Excluir el campo rawBytes para evitar que el JSON sea demasiado grande
        if (key === 'rawBytes') return undefined;
        return value;
      }, 2);
    } catch (error) {
      console.error("Error converting decoded data to string:", error);
      return "Error: Could not display decoded data.";
    }
  }, [decodedData]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      toast({
        title: "Copied to clipboard!",
        description: "The data has been copied.",
      });
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not copy data to clipboard.",
      });
    });
  };
  
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4 sm:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="font-headline text-4xl sm:text-5xl font-bold text-primary flex items-center justify-center gap-3">
            <Binary className="w-10 h-10" />
            ByteScan
          </h1>
          <p className="text-muted-foreground mt-2">
            Instantly scan QR codes and view the raw byte data.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <QrScanner onScan={handleScan} />

          <Card className="w-full">
            <CardHeader>
              <CardTitle>QR Code Data</CardTitle>
              <CardDescription>
                View the raw bytes and decoded structure of the scanned QR code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="raw" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="decoded">Decoded Structure</TabsTrigger>
                  <TabsTrigger value="raw">Raw Bytes</TabsTrigger>
                </TabsList>
                <TabsContent value="decoded" className="relative">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 z-10"
                    onClick={() => handleCopy(decodedDataString)} 
                    disabled={!decodedDataString || isCopied}
                  >
                    {isCopied ? <Check className="text-accent" /> : <Copy className="text-primary" />}
                    <span className="sr-only">Copy</span>
                  </Button>
                  <Textarea
                    readOnly
                    value={decodedDataString}
                    placeholder="Scan a QR code to see the decoded structure here..."
                    className="font-code h-64 resize-none bg-muted/20 pr-10"
                  />
                  {decodedData && (
                    <div className="mt-4 text-sm">
                      <div className="flex items-center gap-2 text-primary font-semibold">
                        <FileText className="w-4 h-4" />
                        <span>Información del Sello Digital</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <span className="text-muted-foreground">Magic Constant:</span>{" "}
                          <code>0x{decodedData.header.magicConstant.toString(16).toUpperCase()}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Versión:</span>{" "}
                          <code>{decodedData.header.version === 0x03 ? "4" : decodedData.header.version}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">País:</span>{" "}
                          <code>{decodedData.header.country}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ID Firmante:</span>{" "}
                          <code>{decodedData.header.signerId}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fecha Emisión:</span>{" "}
                          <code>{decodedData.header.issueDate}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fecha Firma:</span>{" "}
                          <code>{decodedData.header.signDate}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tipo Documento:</span>{" "}
                          <code>{decodedData.header.docType}</code>
                          {decodedData.header.docType === 7 && <span className="text-xs ml-1">(Verificación simple)</span>}
                          {decodedData.header.docType === 8 && <span className="text-xs ml-1">(Verificación completa)</span>}
                          {decodedData.header.docType === 9 && <span className="text-xs ml-1">(Verificación de edad)</span>}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Categoría:</span>{" "}
                          <code>{decodedData.header.docCategory}</code>
                          {decodedData.header.docCategory === 9 && <span className="text-xs ml-1">(DNI en el móvil)</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="raw" className="relative">
                  <div className="flex flex-col gap-4">
                    <div className="relative">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-2 right-2 z-10"
                        onClick={() => handleCopy(byteArrayString)} 
                        disabled={!byteArrayString || isCopied}
                      >
                        {isCopied ? <Check className="text-accent" /> : <Copy className="text-primary" />}
                        <span className="sr-only">Copy</span>
                      </Button>
                      <Textarea
                        readOnly
                        value={byteArrayString}
                        placeholder="Scan a QR code to see the byte array here..."
                        className="font-code h-32 resize-none bg-muted/20 pr-10"
                      />
                    </div>
                    
                    {scannedData && scannedData.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium">Byte Dump (Hexadecimal)</h3>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8"
                            onClick={() => handleCopy(byteArrayTable)}
                          >
                            <Copy className="w-3.5 h-3.5 mr-2" />
                            <span>Copy Hex Dump</span>
                          </Button>
                        </div>
                        <pre className="text-xs font-mono bg-muted/20 p-2 rounded-md overflow-x-auto whitespace-pre">
                          {byteArrayTable}
                        </pre>
                        
                        <div className="mt-4 text-sm">
                          <div className="flex items-center gap-2 text-primary font-semibold">
                            <FileText className="w-4 h-4" />
                            <span>Información de los Bytes</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                            <div>
                              <span className="text-muted-foreground">Primer byte (Magic):</span>{" "}
                              <code>0x{scannedData[0]?.toString(16).toUpperCase().padStart(2, '0') || "??"}</code>
                              {scannedData[0] === 0x40 && <span className="text-xs ml-1">(0x40)</span>}
                              {scannedData[0] === 0xDC && <span className="text-xs ml-1">(0xDC - ICAO 9303)</span>}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Segundo byte (Version):</span>{" "}
                              <code>0x{scannedData[1]?.toString(16).toUpperCase().padStart(2, '0') || "??"}</code>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tamaño total:</span>{" "}
                              <code>{scannedData.length} bytes</code>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Posible formato:</span>{" "}
                              <code>
                                {scannedData[0] === 0xDC ? "ICAO 9303 SDV" : 
                                 scannedData[0] === 0x40 ? "Formato alternativo (0x40)" : 
                                 "Desconocido"}
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
