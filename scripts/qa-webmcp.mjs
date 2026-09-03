import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.env.QA_URL ?? 'http://localhost:3000/';

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.addInitScript(() => {
    const tools = {};
    Object.defineProperty(window, '__webMcpTools', {
      value: tools,
      configurable: true,
    });
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool) {
          tools[tool.name] = tool;
        },
      },
    });
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { state: 'attached' });

  const result = await page.evaluate(async () => {
    const tools = window.__webMcpTools;
    const names = Object.keys(tools).sort();

    if (!tools.read_digital_twin_state || !tools.apply_recommended_operation) {
      throw new Error('Expected WebMCP tools were not registered');
    }

    const before = await tools.read_digital_twin_state.execute({});
    const applied = await tools.apply_recommended_operation.execute({
      recommendedParameters: {
        reservoirTemperature: 66,
        reservoirPressure: 38,
        steamVolume: 1100,
        injectionPressure: 22,
        soakTime: 26,
        strokeLength: 62,
        spm: 6.5,
        vfdFrequency: 35,
      },
      predictions: {
        oilProduction: 42,
        sor: 3.9,
        energyPerBarrel: 2.1,
        rodFailureRisk: 0.02,
      },
    });

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const after = await tools.read_digital_twin_state.execute({});

    let rejectedInvalid = false;
    try {
      await tools.apply_recommended_operation.execute({});
    } catch {
      rejectedInvalid = true;
    }

    return {
      names,
      beforeMode: before.mode,
      appliedMode: applied.mode,
      afterMode: after.mode,
      appliedTemperature: applied.parameters.reservoirTemperature,
      afterTemperature: after.aiRecommendedOperation.reservoirTemperature,
      rejectedInvalid,
    };
  });

  if (result.beforeMode !== 'current') {
    throw new Error('Read tool did not return initial current mode');
  }
  if (result.appliedMode !== 'optimized' || result.afterMode !== 'optimized') {
    throw new Error('Apply tool did not switch to optimized mode');
  }
  if (result.appliedTemperature !== 66 || result.afterTemperature !== 66) {
    throw new Error('Apply tool did not update recommended parameters');
  }
  if (!result.rejectedInvalid) {
    throw new Error('Invalid WebMCP input was not rejected');
  }

  console.table([result]);
} finally {
  await browser.close();
}
