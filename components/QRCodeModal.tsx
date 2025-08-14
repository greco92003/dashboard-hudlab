"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, QrCode, Loader2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  affiliateUrl: string;
  brand?: string;
}

export function QRCodeModal({
  isOpen,
  onClose,
  affiliateUrl,
  brand,
}: QRCodeModalProps) {
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const generateQRCode = async () => {
    try {
      setIsGenerating(true);

      const response = await fetch("/api/qrcode/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: affiliateUrl,
          brand: brand,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao gerar QR code");
      }

      const data = await response.json();
      setQrCodeDataURL(data.qrCode);
      toast.success("QR code gerado com sucesso!");
    } catch (error) {
      console.error("Error generating QR code:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao gerar QR code"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadQRCode = async () => {
    try {
      setIsDownloading(true);

      const params = new URLSearchParams({
        url: affiliateUrl,
      });

      if (brand) {
        params.append("brand", brand);
      }

      const response = await fetch(`/api/qrcode/generate?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Erro ao baixar QR code");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const filename = brand
        ? `qrcode-afiliado-${brand.replace(/\s+/g, "-").toLowerCase()}.png`
        : "qrcode-afiliado.png";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("QR code baixado com sucesso!");
    } catch (error) {
      console.error("Error downloading QR code:", error);
      toast.error("Erro ao baixar QR code");
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado para a área de transferência!`);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      toast.error(`Erro ao copiar ${label.toLowerCase()}`);
    }
  };

  const openInNewTab = () => {
    window.open(affiliateUrl, "_blank");
  };

  // Generate QR code when modal opens
  useEffect(() => {
    if (isOpen && !qrCodeDataURL && !isGenerating) {
      const generateQRCodeEffect = async () => {
        try {
          setIsGenerating(true);

          const response = await fetch("/api/qrcode/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: affiliateUrl,
              brand: brand,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao gerar QR code");
          }

          const data = await response.json();
          setQrCodeDataURL(data.qrCode);
          toast.success("QR code gerado com sucesso!");
        } catch (error) {
          console.error("Error generating QR code:", error);
          toast.error(
            error instanceof Error ? error.message : "Erro ao gerar QR code"
          );
        } finally {
          setIsGenerating(false);
        }
      };

      generateQRCodeEffect();
    }
  }, [isOpen, qrCodeDataURL, isGenerating, affiliateUrl, brand]);

  const handleClose = () => {
    setQrCodeDataURL(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR Code do Link de Afiliado
          </DialogTitle>
          <DialogDescription>
            {brand
              ? `QR code para a marca ${brand}`
              : "QR code do seu link de afiliado"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR Code Display */}
          <div className="flex justify-center">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center w-64 h-64 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  Gerando QR code...
                </p>
              </div>
            ) : qrCodeDataURL ? (
              <div className="relative w-64 h-64 border rounded-lg overflow-hidden">
                <Image
                  src={qrCodeDataURL}
                  alt="QR Code do Link de Afiliado"
                  fill
                  className="object-contain"
                  sizes="256px"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-64 h-64 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                <QrCode className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  QR code não gerado
                </p>
              </div>
            )}
          </div>

          {/* URL Display */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Link de Afiliado:</label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <code className="flex-1 text-xs break-all">{affiliateUrl}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(affiliateUrl, "Link")}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={openInNewTab}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={downloadQRCode}
              disabled={!qrCodeDataURL || isDownloading}
              className="flex-1"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Baixar PNG (600x600)
            </Button>

            <Button
              onClick={generateQRCode}
              variant="outline"
              disabled={isGenerating}
              className="flex-1 sm:flex-none"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <QrCode className="h-4 w-4 mr-2" />
              )}
              Regenerar
            </Button>
          </div>

          {/* Info */}
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>• QR code em alta qualidade (600x600 pixels)</p>
            <p>• Ideal para materiais impressos e compartilhamento</p>
            <p>• Escaneie com qualquer leitor de QR code</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
