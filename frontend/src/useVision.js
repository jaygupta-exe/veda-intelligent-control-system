import { useState, useCallback, useRef, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';

// Module-level cache to persist models across component lifecycles
let cachedCocoModel = null;
let cachedFaceModel = null;
let isLoadingStarted = false;

export const useVision = () => {
  const [visionStatus, setVisionStatus] = useState(cachedCocoModel ? 'READY' : 'IDLE');
  const [error, setError] = useState(null);

  const preloadModels = useCallback(async () => {
    if (cachedCocoModel && cachedFaceModel) {
      setVisionStatus('READY');
      return { coco: cachedCocoModel, face: cachedFaceModel };
    }

    if (isLoadingStarted && !cachedCocoModel) {
        // Wait for existing load if already triggered
        setVisionStatus('LOADING');
        return;
    }

    isLoadingStarted = true;
    setVisionStatus('LOADING');
    console.log("[Vision] Initializing Neural Engine...");

    try {
      // Step 1: Initialize Backend (WebGL is priority for Vision)
      await tf.ready();
      if (tf.getBackend() !== 'webgl') {
        try {
            await tf.setBackend('webgl');
            console.log("[Vision] GPU (WebGL) Backend Accelerated.");
        } catch(e) {
            console.warn("[Vision] WebGL failed, falling back to CPU.");
            await tf.setBackend('cpu');
        }
      }

      // Step 2: Load models in parallel
      const [coco, face] = await Promise.all([
        cocoSsd.load({ base: 'lite_mobilenet_v2' }), // Use lite version if possible for speed
        blazeface.load()
      ]);

      cachedCocoModel = coco;
      cachedFaceModel = face;
      
      console.log("[Vision] AI Models Cached & Ready.");
      setVisionStatus('READY');
      return { coco, face };
    } catch (err) {
      console.error("[Vision] Initialization failed:", err);
      setError(err.message);
      setVisionStatus('ERROR');
      isLoadingStarted = false;
      throw err;
    }
  }, []);

  return { 
    visionStatus, 
    preloadModels, 
    cocoModel: cachedCocoModel, 
    faceModel: cachedFaceModel,
    error 
  };
};
