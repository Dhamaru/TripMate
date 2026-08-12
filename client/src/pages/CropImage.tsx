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
  const { user } = useAuth();
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

  const [imageUrl, setImageUrl] = useState<string>(srcParam || user?.avatar || user?.profileImageUrl || "");
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string>("");
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 480, h: 480 });
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const imageUrlRef = useRef<string>("");
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 60, y: 60, w: 360, h: 360 });
  const [dragging, setDragging] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<string>("");
  const [startPt, setStartPt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [startCrop, setStartCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  const [aspect] = useState<'square' | 'circle' | 'free'>("circle");
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
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

  // Draws the already-loaded source image onto the display (editor) canvas
  // and derives the circular preview from it. Pure function of current
  // transform/crop state — never fetches or decodes the image itself, so it
  // can safely re-run on every crop/zoom/rotation change without racing
  // concurrent image loads.
  const drawToCanvas = () => {
    const img = loadedImageRef.current;
    const canvas = editorCanvasRef.current;
    const preview = previewCanvasRef.current;
    if (!img || !canvas || !preview) return;
    const ctx = canvas.getContext('2d');
    const pctx = preview.getContext('2d');
    if (!ctx || !pctx) return;

    const containerW = containerRef.current?.clientWidth || canvasSize.w;
    const desiredW = Math.min(720, Math.max(320, Math.floor(containerW)));
    const desiredH = desiredW;
    if (canvasSize.w !== desiredW || canvasSize.h !== desiredH) {
      setCanvasSize({ w: desiredW, h: desiredH });
      return; // re-render on the next effect pass once canvasSize settles
    }
    canvas.width = desiredW; canvas.height = desiredH;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.filter = `brightness(${brightness + 100}%) contrast(${contrast + 100}%) saturate(${saturation}%)`;
    const baseScale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * zoom;
    ctx.drawImage(img, -img.naturalWidth * baseScale / 2, -img.naturalHeight * baseScale / 2, img.naturalWidth * baseScale, img.naturalHeight * baseScale);
    ctx.restore();

    // Pixel-perfect preview: extract exact crop region from canvas
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.save();

    // Create circular clipping path for preview
    pctx.beginPath();
    pctx.arc(preview.width / 2, preview.height / 2, preview.width / 2, 0, Math.PI * 2);
    pctx.clip();

    // Extract the exact cropped region from the main canvas
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

  // Loads the source image exactly once per resolvedImageUrl change. Decoding
  // is decoupled from drawing so crop/zoom/rotation changes never re-fetch or
  // re-decode the image, and a stale in-flight load can't win a race against
  // a newer one.
  useEffect(() => {
    if (!resolvedImageUrl) {
      loadedImageRef.current = null;
      setImageLoading(false);
      return;
    }
    let cancelled = false;
    setImageLoading(true);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      loadedImageRef.current = img;
      setImageLoading(false);
      drawToCanvas();
    };
    img.onerror = () => {
      if (cancelled) return;
      loadedImageRef.current = null;
      setImageLoading(false);
      toast({ title: 'Image failed to load', description: 'Could not load this image. Try choosing a different file.', variant: 'destructive' });
    };
    img.src = resolvedImageUrl;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedImageUrl]);

  useEffect(() => {
    drawToCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, aspect, rotation, flipH, flipV, zoom, brightness, contrast, saturation, canvasSize]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      // Prevent scrolling while dragging
      e.preventDefault();
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
          if (dragHandle.includes('n') && dragHandle.includes('w')) {
            next.x = nx + (nw - size);
            next.y = ny + (nh - size);
          } else if (dragHandle.includes('n') && dragHandle.includes('e')) {
            next.y = ny + (nh - size);
          } else if (dragHandle.includes('s') && dragHandle.includes('w')) {
            next.x = nx + (nw - size);
          }
          next.w = size;
          next.h = size;
        }
        setCrop(next);
      }
    };
    const onUp = () => { setDragging(false); setDragHandle(''); };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
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
      if (imageUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(imageUrlRef.current);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      e.currentTarget.value = '';
    }
  };

  // Track the current imageUrl in a ref (for revocation) and revoke any
  // stale blob: URL left over from a previous file selection once React has
  // moved on to a new one.
  useEffect(() => {
    imageUrlRef.current = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (imageUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  const saveCropped = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {

      const img = loadedImageRef.current;
      const canvas = editorCanvasRef.current;
      if (!img || !canvas) throw new Error('no_image');

      // Re-render the full transform pipeline at native source resolution
      // instead of reading pixels back from the viewport-sized display
      // canvas — otherwise the export is capped at whatever size the
      // editor happened to be laid out at (e.g. 480px) regardless of how
      // high-resolution the source photo actually is.
      const S = Math.max(img.naturalWidth, img.naturalHeight) / canvas.width;
      const renderW = Math.round(canvas.width * S);
      const renderH = Math.round(canvas.height * S);
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = renderW;
      renderCanvas.height = renderH;
      const ctx = renderCanvas.getContext('2d');
      if (!ctx) throw new Error('no_render_ctx');
      ctx.save();
      ctx.translate(renderW / 2, renderH / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.filter = `brightness(${brightness + 100}%) contrast(${contrast + 100}%) saturate(${saturation}%)`;
      const baseScale = Math.min(renderW / img.naturalWidth, renderH / img.naturalHeight) * zoom;
      ctx.drawImage(img, -img.naturalWidth * baseScale / 2, -img.naturalHeight * baseScale / 2, img.naturalWidth * baseScale, img.naturalHeight * baseScale);
      ctx.restore();

      const cx = Math.round(crop.x * S);
      const cy = Math.round(crop.y * S);
      const cw = Math.round(crop.w * S);
      const ch = Math.round(crop.h * S);

      // Get raw cropped data at native resolution
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
      // Optimize output size and format; apply scaling to BOTH circle and rectangle
      const maxDim = aspect === 'circle' ? 512 : 1024;
      const scale = Math.min(1, maxDim / Math.max(exportCanvas.width, exportCanvas.height));
      const outCanvas = document.createElement('canvas');
      outCanvas.width = Math.round(exportCanvas.width * scale);
      outCanvas.height = Math.round(exportCanvas.height * scale);
      const octx = outCanvas.getContext('2d');
      if (!octx) throw new Error('no_out_ctx');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(exportCanvas, 0, 0, outCanvas.width, outCanvas.height);

      // The Avatar component already clips to a circle via CSS
      // (border-radius: 9999px + overflow-hidden), so a client-side
      // circular PNG mask serves no visual purpose and only bloats the
      // upload (a transparent PNG runs 4-8x larger than an equivalent
      // JPEG for a photographic image). JPEG for both aspects.
      const finalBlob = await new Promise((resolve, reject) => outCanvas.toBlob(b => b ? resolve(b) : reject(new Error('blob_fail')), 'image/jpeg', 0.85)) as Blob;
      const fd = new FormData();
      fd.append('image', finalBlob, 'avatar.jpg');
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
    <div className="min-h-screen bg-muted text-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-muted/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button onClick={() => navigate('/app/profile')} variant="ghost" size="sm" className="text-muted-foreground hover:text-white smooth-transition interactive-tap min-tap-target">Back</Button>
              <TripMateLogo size="md" />
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/app/profile">
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarImage src={user?.avatar || user?.profileImageUrl} alt="Profile" />
                  <AvatarFallback>{((user?.firstName || user?.email || 'U') as string).slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-header-gap">
        <h1 className="text-3xl font-bold mb-6">Edit Profile Picture</h1>
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-foreground">Crop & Adjust</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div ref={containerRef} className="relative">
                <canvas ref={editorCanvasRef} width={canvasSize.w} height={canvasSize.h} className="w-full h-auto rounded border border-border touch-none" aria-label="Image editor canvas" />
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded">
                    <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
                  </div>
                )}
                <div className="absolute inset-0 touch-none">
                  <div className="absolute border-2 border-blue-400 touch-none" style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, borderRadius: aspect === 'circle' ? '9999px' : '0' }}>
                    <div className="absolute -left-2 -top-2 w-8 h-8 -ml-2 -mt-2 bg-blue-400/50 rounded-full cursor-nw-resize flex items-center justify-center touch-none" onPointerDown={(e) => { e.preventDefault(); setDragHandle('nw'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute -right-2 -top-2 w-8 h-8 -mr-2 -mt-2 bg-blue-400/50 rounded-full cursor-ne-resize flex items-center justify-center touch-none" onPointerDown={(e) => { e.preventDefault(); setDragHandle('ne'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute -left-2 -bottom-2 w-8 h-8 -ml-2 -mb-2 bg-blue-400/50 rounded-full cursor-sw-resize flex items-center justify-center touch-none" onPointerDown={(e) => { e.preventDefault(); setDragHandle('sw'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute -right-2 -bottom-2 w-8 h-8 -mr-2 -mb-2 bg-blue-400/50 rounded-full cursor-se-resize flex items-center justify-center touch-none" onPointerDown={(e) => { e.preventDefault(); setDragHandle('se'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                    <div className="absolute inset-0 cursor-move touch-none" onPointerDown={(e) => { e.preventDefault(); setDragHandle('move'); setDragging(true); setStartPt({ x: e.clientX, y: e.clientY }); setStartCrop(crop); }}></div>
                  </div>
                </div>
              </div>
              <div>
                <canvas ref={previewCanvasRef} width={300} height={300} className="w-full h-auto rounded-full border border-border mb-4" />
                <div className="flex items-center gap-3 mb-4">
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

                {/* Transform controls */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Zoom: {zoom.toFixed(1)}x</label>
                    <input
                      type="range" min="0.5" max="3" step="0.05"
                      value={zoom}
                      onChange={e => setZoom(parseFloat(e.target.value))}
                      className="w-full accent-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Rotation: {rotation}°</label>
                    <input
                      type="range" min="-180" max="180" step="1"
                      value={rotation}
                      onChange={e => setRotation(parseInt(e.target.value))}
                      className="w-full accent-blue-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={flipH ? "default" : "secondary"}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setFlipH(f => !f)}
                    >
                      <i className="fas fa-arrows-alt-h mr-1"></i> Flip H
                    </Button>
                    <Button
                      variant={flipV ? "default" : "secondary"}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setFlipV(f => !f)}
                    >
                      <i className="fas fa-arrows-alt-v mr-1"></i> Flip V
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => { setRotation(0); setZoom(1); setFlipH(false); setFlipV(false); }}
                    >
                      <i className="fas fa-undo mr-1"></i> Reset
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
