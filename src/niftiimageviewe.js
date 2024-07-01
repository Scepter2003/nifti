import React, { useState, useEffect, useRef } from "react";
import * as nifti from "nifti-reader-js";
import "../src/sty.css";

const NiftiViewer = () => {
  const [file, setFile] = useState(null);
  const [niftiHeader, setNiftiHeader] = useState(null);
  const [niftiImage, setNiftiImage] = useState(null);
  const [currentSlice, setCurrentSlice] = useState(0);
  const canvasRef = useRef(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragMode, setDragMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });
  const [originalCanvasWidth, setOriginalCanvasWidth] = useState(0);
  const [originalCanvasHeight, setOriginalCanvasHeight] = useState(0);
  const [selectionPoints, setSelectionPoints] = useState([]);

  const handleDragMode = () => {
    setDragMode(true);
    setSelectMode(false);
  };

  const handleSelectMode = () => {
    setSelectMode(true);
    setDragMode(false);
  };
  const handleDragEnd = () => {
    setDragMode(false);
  };

  const handleDragStart = (e) => {
    if (dragMode) {
      setIsDragging(true);
      setDragStart({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    }
  };
  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  useEffect(() => {
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = new Uint8Array(reader.result);
        if (nifti.isCompressed(data.buffer)) {
          data = nifti.decompress(data.buffer);
        }
        if (nifti.isNIFTI(data.buffer)) {
          const header = nifti.readHeader(data.buffer);
          setNiftiHeader(header);
          const image = nifti.readImage(header, data.buffer);
          setNiftiImage(image);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [file]);

  const scaleImageData = (imageData, scale) => {
    const { width, height } = imageData;
    const scaledWidth = Math.floor(width * scale);
    const scaledHeight = Math.floor(height * scale);
    const scaledImageData = new ImageData(scaledWidth, scaledHeight);

    for (let y = 0; y < scaledHeight; y++) {
      for (let x = 0; x < scaledWidth; x++) {
        const srcX = x / scale;
        const srcY = y / scale;
        const x1 = Math.floor(srcX);
        const y1 = Math.floor(srcY);
        const x2 = Math.min(x1 + 1, width - 1);
        const y2 = Math.min(y1 + 1, height - 1);
        const xFrac = srcX - x1;
        const yFrac = srcY - y1;

        const index = (y * scaledWidth + x) * 4;
        for (let i = 0; i < 3; i++) {
          const p1 = imageData.data[(y1 * width + x1) * 4 + i];
          const p2 = imageData.data[(y1 * width + x2) * 4 + i];
          const p3 = imageData.data[(y2 * width + x1) * 4 + i];
          const p4 = imageData.data[(y2 * width + x2) * 4 + i];

          const interpolated =
            p1 * (1 - xFrac) * (1 - yFrac) +
            p2 * xFrac * (1 - yFrac) +
            p3 * (1 - xFrac) * yFrac +
            p4 * xFrac * yFrac;

          scaledImageData.data[index + i] = interpolated;
        }
        scaledImageData.data[index + 3] = 255; // Alpha channel
      }
    }

    return scaledImageData;
  };

  const drawCanvas = (slice) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const width = niftiHeader.dims[1];
    const height = niftiHeader.dims[2];
    const sliceSize = Math.ceil((width * height) / 4) * 4;
    const sliceOffset = sliceSize * slice;

    // Create an off-screen canvas for the original image
    const offScreenCanvas = document.createElement("canvas");
    offScreenCanvas.width = width;
    offScreenCanvas.height = height;
    const offScreenCtx = offScreenCanvas.getContext("2d");

    const imageData = offScreenCtx.createImageData(width, height);
    const data = new Int16Array(niftiImage, sliceOffset * 2, sliceSize);
    const maxVal = Math.max(...data);
    const minVal = Math.min(...data);
    const range = maxVal - minVal;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const value = ((data[index] - minVal) / range) * 255;
        const pixelIndex = index * 4;
        imageData.data[pixelIndex] = value;
        imageData.data[pixelIndex + 1] = value;
        imageData.data[pixelIndex + 2] = value;
        imageData.data[pixelIndex + 3] = 255;
      }
    }
    offScreenCtx.putImageData(imageData, 0, 0);

    // Clear the main canvas and draw the scaled image
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(offScreenCanvas, 0, 0);
    ctx.restore();
    if (selectionRect) {
      ctx.drawImage(
        offScreenCanvas,
        selectionRect.x,
        selectionRect.y,
        selectionRect.w,
        selectionRect.h,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );
    } else {
      offScreenCtx.putImageData(imageData, 0, 0);
    }
  };

  useEffect(() => {
    if (niftiHeader) {
      setShowCanvas(true);
    }
  }, [niftiHeader]);

  const handleZoomIn = () => {
    setZoomLevel((prevZoomLevel) => prevZoomLevel + 0.1);
  };

  const handleZoomOut = () => {
    setZoomLevel((prevZoomLevel) => prevZoomLevel - 0.1);
  };

  const handleDrag = (e) => {
    if (dragMode && isDragging) {
      const offsetX = e.nativeEvent.offsetX - dragStart.x;
      const offsetY = e.nativeEvent.offsetY - dragStart.y;
      setOffset({ x: offsetX, y: offsetY });
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `image_${currentSlice}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleCancelSelect = () => {
    setSelectMode(false);
    setSelectionRect({ x: 0, y: 0, w: 0, h: 0 });
    setSelectionPoints([]);
  };

  const handleMouseDown = (e) => {
    if (selectMode) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - canvasRect.left;
      const y = e.clientY - canvasRect.top;
      setSelectionPoints([...selectionPoints, { x, y }]);
      drawCanvas(currentSlice); // redraw the canvas with the new selection points
    } else if (dragMode) {
      setDragStart({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
      setIsDragging(true);
    }
  };

  const handleMouseUp = () => {
    if (selectMode && selectionPoints.length === 4) {
      const [p1, p2, p3, p4] = selectionPoints;
      const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
      const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
      const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
      const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
      const selectionRect = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };
      setSelectionRect(selectionRect);
      drawCanvas(currentSlice); // redraw the canvas with the new selection rectangle
      setSelectMode(false);
    } else if (dragMode) {
      setIsDragging(false);
    }
  };

  const drawSelectionRect = () => {
    const canvas = canvasRef.current;
    if (!canvas) return; // Add this check
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "red";
    ctx.fillStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      selectionRect.x,
      selectionRect.y,
      selectionRect.w,
      selectionRect.h
    );
  };
  // Add this to the useEffect hook to redraw the canvas when the selection rectangle changes
  useEffect(() => {
    if (selectionRect) {
      drawSelectionRect();
    }
  }, [selectionRect]);

  useEffect(() => {
    if (selectionRect) {
      drawSelectionRect();
    }
  }, [selectionRect]);

  useEffect(() => {
    if (niftiImage && niftiHeader) {
      drawCanvas(currentSlice);
    }
  }, [niftiImage, niftiHeader, currentSlice, zoomLevel, offset]);

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexDirection: "column",
          alignItems: "center",
          height: "100vh",
          justifyContent: "space-evenly",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "400px",
            border: "2px dashed",
            padding: "2em",
            borderRadius: "10px",
            boxShadow: "0px 0px 10px rgba(0,0,0,0.2)",
          }}
        >
          <input
            type="file"
            onChange={handleFileChange}
            style={{ width: "100%", padding: "1em", fontSize: "1.2em" }}
          />
        </div>
        {showCanvas && (
          <div
            style={{
              width: "100%",
              maxWidth: "800px",
              backgroundColor: "white",
              border: "0.1px solid",
              padding: "2em",
              borderRadius: "10px",
              boxShadow: "0px 0px 10px rgba(0,0,0,0.2)",
              marginTop: "2em",
              marginBottom: "2em",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                marginTop: "1em",
                marginBottom: "3em",
              }}
            >
              <button
                onClick={handleSelectMode}
                style={{
                  padding: "0.5em 1em",
                  fontSize: "1em",
                  marginRight: "1em",
                }}
              >
                Select On
              </button>
              <button
                onClick={handleCancelSelect}
                style={{
                  padding: "0.5em 1em",
                  fontSize: "1em",
                  marginLeft: "1em",
                }}
              >
                Cancel
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width="fit-content"
              height="300%"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              style={{
                display: "block",
                margin: " 0 auto",
                border: "1px solid",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "black",
                cursor: isDragging ? "grabbing" : "auto",
                filter: "contrast(1.2) brightness(1.1) saturate(1.1)",
              }}
            >
              {selectionRect && (
                <rect
                  x={selectionRect.x}
                  y={selectionRect.y}
                  width={selectionRect.w}
                  height={selectionRect.h}
                  fill="grey"
                  stroke="red"
                  strokeWidth="2"
                />
              )}
            </canvas>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                marginTop: "1em",
              }}
            >
              <button
                onClick={handleZoomOut}
                style={{
                  padding: "0.5em 1em",
                  fontSize: "1em",
                  marginRight: "1em",
                }}
              >
                Zoom Out
              </button>
              <button
                onClick={handleZoomIn}
                style={{
                  padding: "0.5em 1em",
                  fontSize: "1em",
                  marginLeft: "1em",
                }}
              >
                Zoom In
              </button>
              <button
                onClick={handleDownload}
                style={{
                  padding: "0.5em 1em",
                  fontSize: "1em",
                  marginLeft: "1em",
                }}
              >
                Download
              </button>
            </div>
            <input
              type="range"
              min="0"
              max={niftiHeader.dims[3] - 1}
              value={currentSlice}
              onChange={(e) => setCurrentSlice(e.target.valueAsNumber)}
              style={{
                width: "80%",
                padding: "1em 0em",
                fontSize: "1.2em",
                marginLeft: "2em",
              }}
            />
            <p
              style={{
                fontSize: "1.2em",
                margin: "0",
                color: "black",
                paddingLeft: "6em",
              }}
            >
              Slide to view Image
            </p>
          </div>
        )}
      </div>
      <div style={{ width: "50vw", height: "fit-content", marginTop: "15em" }}>
        <p
          style={{
            fontSize: "1.2em",
            margin: "0",
            color: "black",
            paddingLeft: "6em",
          }}
        >
          NIFTI Header Data:
          <br />
          {niftiHeader && (
            <table
              style={{
                wordWrap: "break-word",
                width: "80vw",
                border: "1px solid",
                display: "block",
                marginTop: "2em",
              }}
            >
              <tbody
                style={{
                  wordBreak: "break-word",
                  border: "1px solid",
                  borderCollapse: "right",
                }}
              >
                {Object.keys(niftiHeader).map((key, index) => (
                  <tr
                    key={index}
                    style={{
                      wordBreak: "break-word",
                      border: "1px solid",
                      borderCollapse: "right",
                    }}
                  >
                    <td
                      style={{
                        width: "30%",
                        borderRight: "1px solid",
                        borderBottom: "1px solid",
                        textAlign: "justify",
                        width: "20%",
                        padding: "3px",
                        margin: "0",
                      }}
                    >
                      {key}:
                    </td>
                    <td
                      style={{
                        width: "70%",
                        wordWrap: "break-word",
                        borderBottom: "1px solid",
                        padding: "0",
                        margin: "0",
                      }}
                    >
                      {niftiHeader[key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </p>
      </div>
    </>
  );
};

export default NiftiViewer;
