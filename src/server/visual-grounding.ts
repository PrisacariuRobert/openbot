/**
 * B03 — Visual browser interaction + model capability proof.
 *
 * Backend-only. No Codex UI/client changes (read-only hint:
 * src/studio/DirectScreen.tsx is a viewer, not an editing lease).
 *
 * Public coordinate contract: coordinates refer to the exact image returned
 * by that observation. The host owns an inverse affine transform to browser
 * CSS (or native logical) coordinates. Cropped/zoomed images need their own
 * observation ID + transform; never guess crop- vs screen-relative.
 */

export type VisualCapability = "visual-supported" | "text-only";

export type ImageTransform = {
  observationId: string;
  /** Captured window rect in CSS px. */
  capturedX: number;
  capturedY: number;
  capturedWidth: number;
  capturedHeight: number;
  /** Crop rect within the captured image, in captured-image px. */
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  /** Delivered image size in px (after resize). */
  imageWidth: number;
  imageHeight: number;
  deviceScale: number;
  browserZoom: number;
};

export type VisualPoint = { x: number; y: number };

/**
 * Map a model-reported point (delivered-image px) to browser CSS px.
 * Constrained request, not authority: callers must still validate scope +
 * geometry freshness before input. Refuses negative/out-of-view points.
 */
export function visualToCss(
  transform: ImageTransform,
  point: VisualPoint,
): { ok: true; cssX: number; cssY: number } | { ok: false; reason: "OUT_OF_VIEW" | "STALE_TRANSFORM" } {
  if (transform.imageWidth <= 0 || transform.imageHeight <= 0 || transform.cropWidth <= 0 || transform.cropHeight <= 0) {
    return { ok: false, reason: "STALE_TRANSFORM" };
  }
  if (point.x < 0 || point.y < 0 || point.x > transform.imageWidth || point.y > transform.imageHeight) {
    return { ok: false, reason: "OUT_OF_VIEW" };
  }
  const scaleX = transform.cropWidth / transform.imageWidth;
  const scaleY = transform.cropHeight / transform.imageHeight;
  const capturedImageX = transform.cropX + point.x * scaleX;
  const capturedImageY = transform.cropY + point.y * scaleY;
  // Captured-image px → CSS px (deviceScale + browserZoom already baked into capture).
  const cssX = transform.capturedX + capturedImageX / transform.deviceScale;
  const cssY = transform.capturedY + capturedImageY / transform.deviceScale;
  if (cssX < transform.capturedX || cssY < transform.capturedY || cssX > transform.capturedX + transform.capturedWidth || cssY > transform.capturedY + transform.capturedHeight) {
    return { ok: false, reason: "OUT_OF_VIEW" };
  }
  return { ok: true, cssX: Math.round(cssX * 100) / 100, cssY: Math.round(cssY * 100) / 100 };
}

/** Crop for localized high-resolution inspection: returns a child transform
 * bound to a new observation ID. */
export function cropTransform(parent: ImageTransform, cropImageRect: { x: number; y: number; width: number; height: number }, childObservationId: string): ImageTransform {
  const scaleX = parent.cropWidth / parent.imageWidth;
  const scaleY = parent.cropHeight / parent.imageHeight;
  return {
    observationId: childObservationId,
    capturedX: parent.capturedX,
    capturedY: parent.capturedY,
    capturedWidth: parent.capturedWidth,
    capturedHeight: parent.capturedHeight,
    cropX: parent.cropX + cropImageRect.x * scaleX,
    cropY: parent.cropY + cropImageRect.y * scaleY,
    cropWidth: cropImageRect.width * scaleX,
    cropHeight: cropImageRect.height * scaleY,
    imageWidth: cropImageRect.width,
    imageHeight: cropImageRect.height,
    deviceScale: parent.deviceScale,
    browserZoom: parent.browserZoom,
  };
}

export type VisualActionType = "click" | "double-click" | "drag" | "scroll" | "key" | "zoom-inspect";

export type VisualActionRequest = {
  observationId: string;
  transform: ImageTransform;
  action: VisualActionType;
  point: VisualPoint;
  endPoint?: VisualPoint;
  key?: string;
  currentGeometry: { cssWidth: number; cssHeight: number; deviceScale: number; browserZoom: number; scrollX: number; scrollY: number };
};

export function validateVisualAction(
  request: VisualActionRequest,
  capability: VisualCapability,
): { ok: true; cssX: number; cssY: number } | { ok: false; reason: "VISION_UNAVAILABLE" | "STALE_OBSERVATION" | "OUT_OF_VIEW" | "UNSUPPORTED_ACTION" } {
  if (capability !== "visual-supported") return { ok: false, reason: "VISION_UNAVAILABLE" };
  if (request.transform.observationId !== request.observationId) return { ok: false, reason: "STALE_OBSERVATION" };
  if (!["click", "double-click", "drag", "scroll", "key", "zoom-inspect"].includes(request.action)) {
    return { ok: false, reason: "UNSUPPORTED_ACTION" };
  }
  // Geometry check: layout/zoom/window/focus change invalidates the transform.
  if (request.transform.deviceScale !== request.currentGeometry.deviceScale || request.transform.browserZoom !== request.currentGeometry.browserZoom) {
    return { ok: false, reason: "STALE_OBSERVATION" };
  }
  const mapped = visualToCss(request.transform, request.point);
  if (!mapped.ok) return { ok: false, reason: mapped.reason === "STALE_TRANSFORM" ? "STALE_OBSERVATION" : mapped.reason };
  return { ok: true, cssX: mapped.cssX, cssY: mapped.cssY };
}
