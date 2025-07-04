"use client";

import { useState, useMemo } from "react";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Binary } from "lucide-react";

export default function Home() {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();

  const handleScan = (data: string) => {
    setScannedData(data);
  };

  const byteArrayString = useMemo(() => {
    if (!scannedData) return "";
    try {
      const encoder = new TextEncoder();
      const byteArray = encoder.encode(scannedData);
      return `[${byteArray.join(", ")}]`;
    } catch (error) {
      console.error("Error converting to byte array:", error);
      toast({
        variant: "destructive",
        title: "Conversion Error",
        description: "Could not convert scanned data to a byte array.",
      });
      return "Error: Could not convert data.";
    }
  }, [scannedData, toast]);

  const handleCopy = () => {
    if (!byteArrayString) return;
    navigator.clipboard.writeText(byteArrayString).then(() => {
      setIsCopied(true);
      toast({
        title: "Copied to clipboard!",
        description: "The byte array has been copied.",
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
              <CardTitle className="flex items-center justify-between">
                <span>Byte Array Output</span>
                <Button variant="ghost" size="icon" onClick={handleCopy} disabled={!byteArrayString || isCopied}>
                  {isCopied ? <Check className="text-accent" /> : <Copy className="text-primary" />}
                  <span className="sr-only">Copy</span>
                </Button>
              </CardTitle>
              <CardDescription>
                The UTF-8 byte representation of the scanned QR code data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                readOnly
                value={byteArrayString}
                placeholder="Scan a QR code to see the byte array here..."
                className="font-code h-64 resize-none bg-muted/20"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
