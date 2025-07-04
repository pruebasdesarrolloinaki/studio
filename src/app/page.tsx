"use client";

import { useState, useMemo } from "react";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Binary, FileText, UserSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DecodedPayload {
  documentNumber?: string;
  dateOfBirth?: string;
  name?: string;
  surnames?: string;
  sex?: string;
  expiryDate?: string;
  thumbnailInfo?: string;
  unknown?: Array<{ tag: string; length: number; value: string }>;
}

interface DecodedQrData {
  header: {
    magicConstant: number;
    version: number;
    country: string;
    signerId: {
      country: string;
      entity: string;
      certRef: string;
    };
    issueDate: string;
    signDate: string;
    docType: number;
    docCategory: number;
  };
  payload: DecodedPayload;
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
      if (data.length < 12) {
        throw new Error("QR data too short to be a valid ICAO 9303 SDV format");
      }

      let offset = 0;
      
      const magicConstant = data[offset++];
      const version = data[offset++];
      const countryCode = String.fromCharCode(data[offset++], data[offset++]);
      
      const signerCountry = String.fromCharCode(data[offset++], data[offset++]);
      const signerEntity = String.fromCharCode(data[offset++], data[offset++]);
      const certRefSizeStr = String.fromCharCode(data[offset++], data[offset++]);
      const certRefSize = parseInt(certRefSizeStr, 10);

      if (isNaN(certRefSize) || offset + certRefSize > data.length) {
        throw new Error("Invalid or incomplete certificate reference data.");
      }

      let certRefHex = "";
      for (let i = 0; i < certRefSize; i++) {
        certRefHex += data[offset++].toString(16).padStart(2, '0').toUpperCase();
      }
      
      const issueDate = formatDate(data.slice(offset, offset + 3));
      offset += 3;
      
      const signDate = formatDate(data.slice(offset, offset + 3));
      offset += 3;
      
      const docType = data[offset++];
      
      const docCategory = data[offset++];
      
      const header = {
        magicConstant,
        version,
        country: countryCode,
        signerId: {
            country: signerCountry,
            entity: signerEntity,
            certRef: certRefHex
        },
        issueDate,
        signDate,
        docType,
        docCategory
      };
      
      const textDecoder = new TextDecoder('utf-8');
      const allTlvItems: Array<{ tag: number; length: number; value: Uint8Array }> = [];

      while (offset < data.length) {
          const tag = data[offset++];
          if (offset >= data.length) break;

          let length = 0;
          const firstLengthByte = data[offset++];
          if (firstLengthByte < 0x80) {
              length = firstLengthByte;
          } else {
              const numLengthBytes = firstLengthByte & 0x7F;
              if (offset + numLengthBytes > data.length) break;
              for (let i = 0; i < numLengthBytes; i++) {
                  length = (length << 8) | data[offset++];
              }
          }

          if (offset + length > data.length) break;

          const valueBytes = data.slice(offset, offset + length);
          allTlvItems.push({ tag, length, value: valueBytes });
          offset += length;
      }

      const payload: DecodedPayload = {};
      let signature;

      if (allTlvItems.length > 0) {
          const signatureItem = allTlvItems.pop()!;
          const valueHex = Array.from(signatureItem.value)
              .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
              .join('');
          signature = { tag: signatureItem.tag, length: signatureItem.length, value: valueHex };
      }

      allTlvItems.forEach(item => {
          switch (item.tag) {
              case 0x40: payload.documentNumber = textDecoder.decode(item.value); break;
              case 0x42: payload.dateOfBirth = textDecoder.decode(item.value); break;
              case 0x44: payload.name = textDecoder.decode(item.value); break;
              case 0x46: payload.surnames = textDecoder.decode(item.value); break;
              case 0x48: payload.sex = textDecoder.decode(item.value); break;
              case 0x4c: payload.expiryDate = textDecoder.decode(item.value); break;
              case 0x50: payload.thumbnailInfo = `JPEG2000 Image (${item.length} bytes)`; break;
              default:
                  const valueHex = Array.from(item.value).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
                  if (!payload.unknown) payload.unknown = [];
                  payload.unknown.push({ tag: `0x${item.tag.toString(16)}`, length: item.length, value: valueHex });
                  break;
          }
      });
      
      return {
        header,
        payload,
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
  
  const formatDate = (bytes: Uint8Array): string => {
    if (bytes.length !== 3) return "Invalid date";
    
    const year = 2000 + bytes[0]; 
    const month = bytes[1];
    const day = bytes[2];
    
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };

  const handleScan = (data: string) => {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i);
    }
    setScannedData(bytes);
    
    try {
      const decoded = decodeQrData(bytes);
      setDecodedData(decoded);
    } catch (error) {
      console.error("Error decoding QR data:", error);
      setDecodedData(null);
      toast({
        variant: "default",
        title: "Showing raw bytes",
        description: "Data does not follow expected format, but you can see the raw bytes.",
      });
    }
  };

  const byteArrayString = useMemo(() => {
    if (!scannedData) return "";
    try {
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
  
  const byteArrayTable = useMemo(() => {
    if (!scannedData) return "";
    try {
      let result = "Offset | 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F | ASCII\n";
      result += "-------|-------------------------------------------------|----------------\n";
      
      for (let i = 0; i < scannedData.length; i += 16) {
        const offset = i.toString(16).toUpperCase().padStart(6, '0');
        result += `${offset} | `;
        
        const rowBytes = [];
        const rowAscii = [];
        
        for (let j = 0; j < 16; j++) {
          if (i + j < scannedData.length) {
            const byte = scannedData[i + j];
            rowBytes.push(byte.toString(16).toUpperCase().padStart(2, '0'));
            
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
              <Tabs defaultValue="decoded" className="w-full">
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
                    value={decodedData ? decodedDataString : "Scan a QR code to see the decoded structure here..."}
                    placeholder="Scan a QR code to see the decoded structure here..."
                    className="font-code h-64 resize-none bg-muted/20 pr-10"
                  />
                  {decodedData && (
                    <div className="mt-4 text-sm space-y-4">
                      <div>
                        <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                          <FileText className="w-4 h-4" />
                          <span>Información del Sello Digital (Cabecera)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div><span className="text-muted-foreground">Magic:</span> <code>0x{decodedData.header.magicConstant.toString(16).toUpperCase()}</code></div>
                          <div><span className="text-muted-foreground">Versión:</span> <code>{decodedData.header.version}</code></div>
                          <div><span className="text-muted-foreground">País Emisor:</span> <code>{decodedData.header.country}</code></div>
                          <div><span className="text-muted-foreground">ID Firmante:</span> <code>{`${decodedData.header.signerId.country}${decodedData.header.signerId.entity}`}</code></div>
                          <div className="col-span-2"><span className="text-muted-foreground">Ref. Certificado:</span> <code className="break-all text-xs">{decodedData.header.signerId.certRef}</code></div>
                          <div><span className="text-muted-foreground">Fecha Emisión:</span> <code>{decodedData.header.issueDate}</code></div>
                          <div><span className="text-muted-foreground">Fecha Firma:</span> <code>{decodedData.header.signDate}</code></div>
                          <div><span className="text-muted-foreground">Tipo Doc:</span> <code>{decodedData.header.docType}</code></div>
                          <div><span className="text-muted-foreground">Categoría Doc:</span> <code>{decodedData.header.docCategory}</code></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                          <UserSquare className="w-4 h-4" />
                          <span>Contenido del Documento (Payload)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {decodedData.payload.documentNumber && <div><span className="text-muted-foreground">Nº Documento:</span> <code>{decodedData.payload.documentNumber}</code></div>}
                          {decodedData.payload.name && <div><span className="text-muted-foreground">Nombre:</span> <code>{decodedData.payload.name}</code></div>}
                          {decodedData.payload.surnames && <div className="col-span-2"><span className="text-muted-foreground">Apellidos:</span> <code>{decodedData.payload.surnames}</code></div>}
                          {decodedData.payload.dateOfBirth && <div><span className="text-muted-foreground">Nacimiento:</span> <code>{decodedData.payload.dateOfBirth}</code></div>}
                          {decodedData.payload.expiryDate && <div><span className="text-muted-foreground">Caducidad:</span> <code>{decodedData.payload.expiryDate}</code></div>}
                          {decodedData.payload.sex && <div><span className="text-muted-foreground">Sexo:</span> <code>{decodedData.payload.sex}</code></div>}
                          {decodedData.payload.thumbnailInfo && <div className="col-span-2"><span className="text-muted-foreground">Imagen:</span> <code>{decodedData.payload.thumbnailInfo}</code></div>}
                          {decodedData.payload.unknown?.map((item, index) => (
                             <div key={index} className="col-span-2"><span className="text-muted-foreground">Campo desc. ({item.tag}):</span> <code className="break-all text-xs">{item.value}</code></div>
                          ))}
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
                              {scannedData[0] === 0xDC && <span className="text-xs ml-1">(ICAO 9303)</span>}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Versión:</span>{" "}
                              <code>{scannedData[1] ?? "??"}</code>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tamaño total:</span>{" "}
                              <code>{scannedData.length} bytes</code>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Posible formato:</span>{" "}
                              <code>
                                {scannedData[0] === 0xDC ? "ICAO 9303 SDV" : "Desconocido"}
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
