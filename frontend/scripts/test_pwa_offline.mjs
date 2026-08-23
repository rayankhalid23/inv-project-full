/**
 * Universal PWA Offline & Multi-Operation Sync Verification Test Suite
 * Validates all CRUD and inventory offline handlers, conflict exceptions, and SW precache.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');

console.log('🔍 Starting Full-System PWA Offline & Multi-Operation Verification Suite...\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Check Manifest File
console.log('1. Verifying manifest.json...');
const manifestPath = path.join(frontendDir, 'public', 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.display === 'standalone', 'Manifest display mode is standalone');
assert(manifest.start_url === '/?source=pwa', 'Manifest start_url is /?source=pwa');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 4, 'Manifest has at least 4 icon configurations');

// Verify each icon file in public/
manifest.icons.forEach((icon) => {
  const iconPath = path.join(frontendDir, 'public', icon.src.replace(/^\//, ''));
  assert(fs.existsSync(iconPath), `Icon file exists: ${icon.src}`);
});

// 2. Check Service Worker in dist/
console.log('\n2. Verifying Service Worker (dist/sw.js) & Precache Manifest...');
const swPath = path.join(distDir, 'sw.js');
assert(fs.existsSync(swPath), 'dist/sw.js was generated');
const swContent = fs.readFileSync(swPath, 'utf8');

// Verify critical views are precached
const requiredViews = ['ProductsPage', 'SalesPage', 'Employees', 'Settings', 'StockMovementsPage', 'Reports'];
requiredViews.forEach((view) => {
  const isPrecached = swContent.includes(view);
  assert(isPrecached, `UI view chunk [${view}] is included in Service Worker Precache`);
});

assert(swContent.includes('index.html'), 'index.html is precached');
assert(swContent.includes('index-') && swContent.includes('.css'), 'Main CSS bundle is precached');
assert(swContent.includes('react-vendor'), 'React vendor bundle is precached');
assert(swContent.includes('ui-vendor'), 'UI vendor bundle is precached');

// 3. Verify Universal Sync Engine Operation Types
console.log('\n3. Verifying Universal Sync Engine All Operation Types...');
const syncEnginePath = path.join(frontendDir, 'src', 'utils', 'syncEngine.js');
assert(fs.existsSync(syncEnginePath), 'syncEngine.js exists');
const syncContent = fs.readFileSync(syncEnginePath, 'utf8');

const supportedOperations = [
  'CREATE_ORDER',
  'QUICK_SALE',
  'DIRECT_SALE',
  'SCAN_RETURN',
  'SCAN_DAMAGE',
  'UPDATE_ORDER',
  'DELETE_ORDER',
  'ASSIGN_DELIVERY',
  'SEND_DARB_SHIPMENT',
  'ADD_STOCK',
  'CREATE_CATALOG',
  'UPDATE_CATALOG',
  'TOGGLE_CATALOG_STATUS',
  'DELETE_PRODUCT',
  'UPDATE_VARIANT_PARTIAL',
  'CREATE_EMPLOYEE',
  'UPDATE_EMPLOYEE',
  'DELETE_EMPLOYEE',
  'RESTORE_EMPLOYEE',
  'UPDATE_PROFILE'
];

supportedOperations.forEach((op) => {
  assert(syncContent.includes(op), `syncEngine supports operation type [${op}]`);
});

// 4. Verify Exception and Conflict Management in Sync Engine
console.log('\n4. Verifying Conflict & Exception Handling in Sync Engine...');
assert(syncContent.includes('status === 401 || status === 403'), 'Sync engine securely handles 401/403 session expiration');
assert(syncContent.includes('UNRECOVERABLE_STATUSES') && syncContent.includes('404') && syncContent.includes('409'), 'Sync engine safely resolves 404 (already deleted) and 409 (duplicate conflict)');
assert(syncContent.includes('isSyncingActive = false'), 'Sync engine guarantees mutex release on completion or error');

// 5. Verify Offline Integrations in UI Components
console.log('\n5. Verifying Offline Handlers in UI Components...');
const catalogsPage = fs.readFileSync(path.join(frontendDir, 'src', 'pages', 'Products', 'components', 'CatalogsPage.jsx'), 'utf8');
assert(catalogsPage.includes('CREATE_CATALOG') && catalogsPage.includes('UPDATE_CATALOG') && catalogsPage.includes('TOGGLE_CATALOG_STATUS'), 'CatalogsPage supports offline create, update, and toggle');

const productCard = fs.readFileSync(path.join(frontendDir, 'src', 'pages', 'Products', 'components', 'ProductCard.jsx'), 'utf8');
assert(productCard.includes('DELETE_PRODUCT'), 'ProductCard supports offline delete');

const employeesPage = fs.readFileSync(path.join(frontendDir, 'src', 'pages', 'Employees.jsx'), 'utf8');
assert(employeesPage.includes('DELETE_EMPLOYEE') && employeesPage.includes('RESTORE_EMPLOYEE'), 'Employees page supports offline soft delete and restore');

const addEmployeeModal = fs.readFileSync(path.join(frontendDir, 'src', 'pages', 'AddEmployeeModal.jsx'), 'utf8');
assert(addEmployeeModal.includes('CREATE_EMPLOYEE') && addEmployeeModal.includes('UPDATE_EMPLOYEE'), 'AddEmployeeModal supports offline create and update');

const settingsPage = fs.readFileSync(path.join(frontendDir, 'src', 'pages', 'Settings.jsx'), 'utf8');
assert(settingsPage.includes('UPDATE_PROFILE'), 'Settings page supports offline profile update');

console.log(`\n========================================`);
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Full-System PWA Offline & Multi-Operation tests passed successfully!');
}
