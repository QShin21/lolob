import { chromium as engine } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
export const chromium = {
  launch: async options => {
    const browser=await engine.launch({ ...options, executablePath: '/usr/bin/chromium', args: [...(options?.args || []), '--no-sandbox'] });
    if(process.env.RIFTCAST_SOL_LEGACY==='1'){
      const createContext=browser.newContext.bind(browser);
      browser.newContext=async options=>{
        const context=await createContext(options);context.setDefaultTimeout(5000);
        await context.route('**/api/obs/**',r=>r.request().method()==='GET'?r.continue():r.fulfill({status:403,json:{error:'Sol prohibits physical engine/device changes'}}));
        await context.route('**/api/connect',r=>r.fulfill({status:403,json:{error:'Sol prohibits real source connections'}}));
        return context;
      };
      browser.newPage=async options=>(await browser.newContext(options)).newPage();
    }
    return browser;
  },
};
