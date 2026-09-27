import { describe, expect, it } from "vitest";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "../client/src/game/scene";

describe("Babylon shader registration", () => {
  it("registers every scene and glow-layer GLSL program before rendering", () => {
    for (const name of [
      "defaultVertexShader",
      "defaultPixelShader",
      "glowMapGenerationVertexShader",
      "glowMapGenerationPixelShader",
      "kernelBlurVertexShader",
      "kernelBlurPixelShader",
      "glowMapMergeVertexShader",
      "glowMapMergePixelShader",
      "glowBlurPostProcessPixelShader",
    ]) {
      expect(ShaderStore.ShadersStore[name], `${name} should be registered`).toBeTruthy();
    }
  });
});
