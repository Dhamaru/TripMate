import { TripMateLogo } from "@/components/TripMateLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function CropImagePage() {
  const { user, token } = useAuth() as any;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const srcParam = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return sp.get('src') || '';
    } catch {
      return '';
    }
  }, []);

  const [imageUrl, setImageUrl] = useState<string>(srcParam || user?.profileImageUrl || "");
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string>("");
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 480, h: 480 });
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 60, y: 60, w: 360, h: 360 });
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<string>("");
  const [startPt, setStartPt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [startCrop, setStartCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  const [aspect] = useState<'square' | 'circle' | 'free'>("circle");
  const rotation = 0;
  const flipH = false;
  const flipV = false;
  const zoom = 1;
  const brightness = 0;
  const contrast = 0;
  const saturation = 100;
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const url = imageUrl || '';
    const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin) || url.startsWith('blob:') || url.startsWith('data:');
    if (!url) { setResolvedImageUrl(""); return; }
    if (sameOrigin) { setResolvedImageUrl(url); return; }
    const proxied = `/api/v1/proxy-image?url=${encodeURIComponent(url)}`;
    if (!cancelled) setResolvedImageUrl(proxied);
    return () => { cancelled = true; };
  }, [imageUrl]);

  const renderPreview = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = editorCanvasRef.current;
      const preview = previewCanvasRef.current;
      if (!canvas || !preview) return;
      const ctx = canvas.getContext('2d');
      const pctx = preview.getContext('2d');
      if (!ctx || !pctx) return;

      const containerW = containerRef.current?.clientWidth || canvasSize.w;
      const desiredW = Math.min(720, Math.max(320, Math.floor(containerW)));
      const desiredH = desiredW;
      if (canvasSize.w !== desiredW || canvasSize.h !== desiredH) {
        setCanvasSize({ w: desiredW, h: desiredH });
      }
      canvas.width = desiredW; canvas.height = desiredH;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.filter = `brightness(${brightness + 100}%) contrast(${contrast + 100}%) saturate(${saturation}%)`;
      const baseScale = Math.min(canvas.width / img.width, canvas.height / img.height) * zoom;
      ctx.drawImage(img, -img.width * baseScale / 2, -img.height * baseScale / 2, img.width * baseScale, img.height * baseScale);
      ctx.restore();

      // Pixel-perfect preview: extract exact crop region from canvas
      pctx.clearRect(0, 0, preview.width, preview.height);
      pctx.save();

      // Create circular clipping path for preview
      pctx.beginPath();
      pctx.arc(preview.width / 2, preview.height / 2, preview.width / 2, 0, Math.PI * 2);
      pctx.clip();

      // Extract the exact cropped region from the main canvas
      // srcX = cropLeft, srcY = cropTop, srcW = cropWidth, srcH = cropHeight
      const srcX = crop.x;
      const srcY = crop.y;
      const srcW = crop.w;
      const srcH = crop.h;

      // Calculate scale to fit crop into preview circle
      const scale = preview.width / Math.max(srcW, srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;

      // Center the scaled crop in the preview
      const offsetX = (preview.width - scaledW) / 2;
      const offsetY = (preview.height - scaledH) / 2;

      // Draw the exact cropped region from canvas to preview
      pctx.drawImage(
        canvas,           // source canvas
        srcX, srcY, srcW, srcH,  // source rectangle (crop region)
        offsetX, offsetY, scaledW, scaledH  // destination rectangle (centered in preview)
      );

      pctx.restore();
    };
    img.src = resolvedImageUrl || imageUrl;
  };

  useEffect(() => {
    renderPreview();
  }, [resolvedImageUrl, imageUrl, crop, aspect, rotation, brightness, contrast, saturation, canvasSize]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startPt.x;
      const dy = e.clientY - startPt.y;
      if (dragHandle === 'move') {
        setCrop(c => ({ ...c, x: Math.max(0, Math.min(canvasSize.w - c.w, startCrop.x + dx)), y: Math.max(0, Math.min(canvasSize.h - c.h, startCrop.y + dy)) }));
      } else {
        const sc = { ...startCrop };
        let nx = sc.x, ny = sc.y, nw = sc.w, nh = sc.h;
        if (dragHandle.includes('n')) { ny = Math.max(0, Math.min(sc.y + dy, sc.y + sc.h - 50)); nh = sc.h + (sc.y - ny); }
        if (dragHandle.includes('s')) { nh = Math.max(50, Math.min(sc.h + dy, canvasSize.h - sc.y)); }
        if (dragHandle.includes('w')) { nx = Math.max(0, Math.min(sc.x + dx, sc.x + sc.w - 50)); nw = sc.w + (sc.x - nx); }
        if (dragHandle.includes('e')) { nw = Math.max(50, Math.min(sc.w + dx, canvasSize.w - sc.x)); }
        let next = { x: nx, y: ny, w: nw, h: nh };
        if (aspect !== 'free') {
          // Maintain square aspect ratio
          const size = Math.min(next.w, next.h);
          // Adjust position based on which handle is being dragged
          if (dragHandle.includes('n') && dragHandle.includes('w')) {
            // NW corner: adjust both x and y
            next.x = nx + (nw - size);
            next.y = ny + (nh - size);
          } else if (dragHandle.includes('n') && dragHandle.includes('e')) {
            // NE corner: adjust y only
            next.y = ny + (nh - size);
          } else if (dragHandle.includes('s') && dragHandle.includes('w')) {
            // SW corner: adjust x only
            next.x = nx + (nw - size);
          }
          // SE corner and edge handles: no position adjustment needed
          next.w = size;
          next.h = size;
        }
        setCrop(next);
      }
    };
    const onUp = () => { setDragging(false); setDragHandle(''); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, dragHandle, startPt, startCrop, canvasSize]);

  const openFileDialog = () => {
    document.getElementById('fileInput')?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 5 * 1024 * 1024;
      if (!allowed.includes(file.type) || file.size > maxSize) {
        toast({ title: 'Invalid file', description: 'Select JPEG/PNG/GIF/WEBP up to 5MB', variant: 'destructive' });
        e.currentTarget.value = '';
        return;
      }
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      e.currentTarget.value = '';
    }
  };

  const saveCropped = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      // Try to refresh token if expired
      let currentToken = token;
      if (!currentToken) {
        try {
          const refreshRes = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            credentials: "include"
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            currentToken = data?.token;
            if (currentToken) {
              (window as any).__authToken = currentToken;
            }
          }
        } catch (e) {
          console.error('Token refresh failed:', e);
        }
      }

      // If still no token, show error
      if (!currentToken) {
        toast({
          title: 'Authentication required',
          description: 'Please sign in again to save your profile picture.',
          variant: 'destructive'
        });
        setIsSaving(false);
        return;
      }

      const sourceCanvas = editorCanvasRef.current;
      if (!sourceCanvas) throw new Error('no_canvas');

      const cx = Math.round(crop.x);
      const cy = Math.round(crop.y);
      const cw = Math.round(crop.w);
      const ch = Math.round(crop.h);

      const ctx = sourceCanvas.getContext('2d');
      if (!ctx) throw new Error('no_src_ctx');

      // Get raw cropped data
      const imageData = ctx.getImageData(cx, cy, cw, ch);

      // Put on temp canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cw;
      tempCanvas.height = ch;
      const tctx = tempCanvas.getContext('2d');
      if (!tctx) throw new Error('no_temp_ctx');
      tctx.putImageData(imageData, 0, 0);

      // Create export canvas (enforcing min size)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.max(300, cw);
      exportCanvas.height = Math.max(300, ch);
      const ex = exportCanvas.getContext('2d');
      if (!ex) throw new Error('no_ctx');

      // Draw temp canvas scaled to export canvas
      ex.imageSmoothingEnabled = true;
      ex.imageSmoothingQuality = 'high';
      ex.drawImage(tempCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
      // Optimize output size and format; preserve transparency for circle
      let finalBlob: Blob;
      if (aspect === 'circle') {
        const masked = document.createElement('canvas');
        masked.width = exportCanvas.width; masked.height = exportCanvas.height;
        const mctx = masked.getContext('2d');
        if (!mctx) throw new Error('no_mask_ctx');
        mctx.imageSmoothingEnabled = true;
        mctx.imageSmoothingQuality = 'high';
        mctx.beginPath();
        const r = Math.min(masked.width, masked.height) / 2;
        mctx.arc(masked.width / 2, masked.height / 2, r, 0, Math.PI * 2);
        mctx.clip();
        mctx.drawImage(exportCanvas, 0, 0);
        finalBlob = await new Promise((resolve, reject) => masked.toBlob(b => b ? resolve(b) : reject(new Error('blob_fail')), 'image/png')) as Blob;
      } else {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(exportCanvas.width, exportCanvas.height));
        const outCanvas = document.createElement('canvas');
        outCanvas.width = Math.round(exportCanvas.width * scale);
        outCanvas.height = Math.round(exportCanvas.height * scale);
        const octx = outCanvas.getContext('2d');
        if (!octx) throw new Error('no_out_ctx');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(exportCanvas, 0, 0, outCanvas.width, outCanvas.height);
        finalBlob = await new Promise((resolve, reject) => outCanvas.toBlob(b => b ? resolve(b) : reject(new Error('blob_fail')), 'image/jpeg', 0.85)) as Blob;
      }
      const fd = new FormData();
      fd.append('image', finalBlob, aspect === 'circle' ? 'avatar.png' : 'avatar.jpg');
      const res = await apiRequest('POST', '/api/v1/auth/user/avatar', fd);
      const updated = await res.json();
      queryClient.setQueryData(["/api/v1/auth/user"], updated);
      toast({ title: 'Profile updated', description: 'Your profile picture has been updated.' });
      navigate('/app/profile');
    } catch (e: any) {
      const msg = String(e?.message || e || 'error');
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ios-darker text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ios-darker/80 border-b border-ios-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button onClick={() => navigate('/profile')} variant="ghost" size="sm" className="text-ios-gray hover:text-white smooth-transition interactive-tap min-tap-target">Back</Button>
              <TripMateLogo size="md" />
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/app/profile">
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarImage src={user?.profileImageUrl} alt="Profile" />
                  <AvatarFallback>{((user?.firstName || user?.email || 'U') as string).slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-header-gap">
        <h1 className="text-3xl font-bold mb-6">Edit Profile Picture</h1>
        <Card className="bg-ios-card border-ios-gray">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-white">Crop & Adjust</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div ref={containerRef} className="relative">
                <canvas ref={editorCanvasRef} width={canvasSize.w} height={canvasSize.h} className="w-full h-auto rounded border border-ios-gray touch-pan-y" aria-label="Image editor canvas" />
                <div className="absolute inset-0">
                  <div className="absolute border-2 border-blue-400" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, borderRadius: aspect === 'circle' ? '9999px' : '0' }}>
                    <div className="absolute -left-2 -top-2 w-4 h-4 bg-blue-400 cursor-nw-resize" onMouseDown={(e) => { setDragHandle('nw'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute -right-2 -top-2 w-4 h-4 bg-blue-400 cursor-ne-resize" onMouseDown={(e) => { setDragHandle('ne'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute -left-2 -bottom-2 w-4 h-4 bg-blue-400 cursor-sw-resize" onMouseDown={(e) => { setDragHandle('sw'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute -right-2 -bottom-2 w-4 h-4 bg-blue-400 cursor-se-resize" onMouseDown={(e) => { setDragHandle('se'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 bg-blue-400 cursor-n-resize" onMouseDown={(e) => { setDragHandle('n'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 bg-blue-400 cursor-s-resize" onMouseDown={(e) => { setDragHandle('s'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-4 bg-blue-400 cursor-w-resize" onMouseDown={(e) => { setDragHandle('w'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-4 bg-blue-400 cursor-e-resize" onMouseDown={(e) => { setDragHandle('e'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute inset-0 cursor-move" onMouseDown={(e) => { setDragHandle('move'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                  </div>
                </div>
              </div>
              <div>
                <canvas ref={previewCanvasRef} width={300} height={300} className="w-full h-auto rounded-full border border-ios-gray mb-4" />
                <div className="flex items-center gap-3">
                  <Input id="fileInput" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <Button variant="secondary" onClick={openFileDialog} className="flex-1">
                    <i className="fas fa-image mr-2"></i>
                    Choose Image
                  </Button>
                  <Button onClick={saveCropped} disabled={isSaving} className="flex-1">
                    <i className="fas fa-check mr-2"></i>
                    {isSaving ? 'Saving…' : 'OK'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
