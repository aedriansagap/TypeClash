import * as ort from 'onnxruntime-web';
import { Difficulty, GameModifiers } from './Dictionary';

export class AdaptiveDifficulty {
  private session: ort.InferenceSession | null = null;
  private isLoaded: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      // Configure ort to locate WASM binaries
      ort.env.wasm.wasmPaths = '/';
      this.session = await ort.InferenceSession.create('/models/adaptive_model.onnx');
      this.isLoaded = true;
      console.log('Adaptive Difficulty ML Model loaded successfully.');
    } catch (e) {
      console.error('Failed to load ONNX model:', e);
    }
  }

  /**
   * Predict the ideal difficulty based on real-time metrics.
   * Target classes from training: 0 (EASY), 1 (HARD), 2 (MODS)
   */
  public async predictDifficulty(wpm: number, accuracy: number, combo: number): Promise<{ difficulty: Difficulty, mods?: GameModifiers }> {
    if (!this.isLoaded || !this.session) {
      // Fallback if model fails to load
      return { difficulty: Difficulty.EASY };
    }

    try {
      // Prepare the input tensor. Note: scikit-learn random forest expects a Float32Array of shape [1, 3]
      const inputData = Float32Array.from([wpm, accuracy, combo]);
      const tensor = new ort.Tensor('float32', inputData, [1, 3]);

      const feeds: Record<string, ort.Tensor> = {};
      // The input name in the ONNX model exported by skl2onnx was set to 'float_input'
      feeds['float_input'] = tensor;

      const results = await this.session.run(feeds);
      
      // The output contains 'output_label' (which class won) and 'output_probability'
      const labelTensor = results.output_label;
      
      // Scikit-learn outputs class labels as Int64 by default.
      // Depending on the version, the output tensor might be Int64 or string. 
      // We'll read the first element of the data array.
      const prediction = Number(labelTensor.data[0]);

      if (prediction === 2) {
        return { 
          difficulty: Difficulty.HARD, 
          mods: { includeNumbers: true, includePunctuation: true, longestWords: false } 
        };
      } else if (prediction === 1) {
        return { difficulty: Difficulty.HARD };
      } else {
        return { difficulty: Difficulty.EASY };
      }
    } catch (e) {
      console.error('Error during ML inference:', e);
      return { difficulty: Difficulty.EASY };
    }
  }
}
