const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Compile the actual source in memory and replace only external boundaries.
function loadSource(file, mocks, env = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    .replaceAll('import.meta.env', '__env');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, __env: env, console: { info() {} },
    window: { location: { href: 'https://example.test/', search: '', pathname: '/' } }, URLSearchParams,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename: file });
  return exports;
}

function createService(init, extra = {}) {
  return loadSource('lib/liff/liff.ts', {
    '@line/liff': { init, isLoggedIn: () => true, isInClient: () => true, ...extra },
  }, { VITE_LIFF_ID: '2011632269-xjYdlBwl' }).liffService;
}

test('concurrent initialization and later consumers call SDK once', async () => {
  let calls = 0;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const service = createService(() => { calls++; return pending; });
  const first = service.init();
  const second = service.init();
  assert.equal(calls, 1);
  finish();
  assert.equal((await first).isReady, true);
  assert.equal((await second).isReady, true);
  await service.init();
  assert.equal(calls, 1);
});

test('failed SDK initialization does not automatically retry', async () => {
  let calls = 0;
  const service = createService(() => { calls++; return Promise.reject(new Error('init failed')); });
  assert.equal((await service.init()).isReady, false);
  assert.equal((await service.init()).error, 'init failed');
  assert.equal(calls, 1);
});

test('login does not redirect inside LINE or when already logged in', async () => {
  let calls = 0;
  const service = createService(async () => {}, { login: () => calls++ });
  await service.init();
  service.login();
  assert.equal(calls, 0);
});

test('external logged-out browser can explicitly log in', async () => {
  let calls = 0;
  const service = createService(async () => {}, {
    isLoggedIn: () => false, isInClient: () => false, login: () => calls++,
  });
  await service.init();
  service.login();
  assert.equal(calls, 1);
});

for (const [name, auth, expected] of [
  ['initializing', { loading: true, liffStatus: null }, false],
  ['failed', { loading: false, liffStatus: { isReady: false, error: 'failed' } }, false],
  ['session pending', { loading: true, liffStatus: { isReady: true } }, false],
  ['ready', { user: { id: 'synthetic' }, loading: false, liffStatus: { isReady: true } }, true],
]) {
  test(`router is gated while ${name}`, () => {
    let mounted = false;
    const { AppRoutes } = loadSource('App.tsx', {
      './auth/AuthContext': { useAuth: () => auth },
      './components/Navigation': { Navigation: () => null },
      './pages/TimelinePage': { TimelinePage: () => null },
      './pages/ChildrenPage': { ChildrenPage: () => null },
      './pages/NewEntryPage': { NewEntryPage: () => null },
      './pages/ReportsPage': { ReportsPage: () => null },
      './pages/CalendarPage': { CalendarPage: () => null },
      './pages/BillingPage': { BillingPage: () => null },
      './pages/ContractPage': { ContractPage: () => null },
      './pages/HandoffPage': { HandoffPage: () => null },
      './pages/AcceptInvitePage': { AcceptInvitePage: () => null },
      './pages/InvitationsPage': { InvitationsPage: () => null },
      './pages/DevPage': { DevPage: () => null },
      'react-router-dom': {
        BrowserRouter: () => { mounted = true; return null; },
        Routes: () => null, Route: () => null, Navigate: () => null,
      },
    });
    renderToStaticMarkup(React.createElement(AppRoutes));
    assert.equal(mounted, expected);
  });
}
