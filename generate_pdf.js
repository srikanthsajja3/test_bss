const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OneBSS Platform - 22 Enhancement Items Specification</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 15mm 18mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.5;
      font-size: 11pt;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }
    .header-banner {
      border-bottom: 3px solid #10b981;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header-title {
      font-size: 22pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.5px;
    }
    .header-subtitle {
      font-size: 12pt;
      color: #64748b;
      margin: 0;
      font-weight: 500;
    }
    .meta-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 10px;
    }
    .meta-item {
      font-size: 9.5pt;
    }
    .meta-item strong {
      color: #0f172a;
    }
    h2.section-header {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      background: #f1f5f9;
      padding: 8px 12px;
      border-left: 4px solid #10b981;
      border-radius: 0 6px 6px 0;
      margin-top: 24px;
      margin-bottom: 14px;
      page-break-after: avoid;
    }
    .item-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
      background: #ffffff;
    }
    .item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .item-num {
      display: inline-block;
      background: #10b981;
      color: #ffffff;
      font-weight: 700;
      font-size: 9pt;
      padding: 2px 8px;
      border-radius: 4px;
      margin-right: 8px;
    }
    .item-num-blue {
      background: #3b82f6;
    }
    .item-title {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
    }
    .item-badge {
      font-size: 8.5pt;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-completed {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .item-desc {
      font-size: 9.5pt;
      color: #334155;
      margin-bottom: 6px;
    }
    .item-files {
      font-size: 8.5pt;
      color: #64748b;
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f8fafc;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    table.summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      margin-bottom: 20px;
      font-size: 9pt;
    }
    table.summary-table th {
      background: #0f172a;
      color: #ffffff;
      text-align: left;
      padding: 8px 10px;
      font-weight: 700;
    }
    table.summary-table td {
      border-bottom: 1px solid #e2e8f0;
      padding: 8px 10px;
      color: #334155;
    }
    table.summary-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .footer-note {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 8.5pt;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>

  <div class="header-banner">
    <div class="header-title">OneBSS BSS Platform — 22 Requirements Release Report</div>
    <div class="header-subtitle">Comprehensive Technical Specification & Implementation Details</div>
  </div>

  <div class="meta-box">
    <div class="meta-item"><strong>Platform:</strong> onebss_expo (React Native / Expo Web)</div>
    <div class="meta-item"><strong>Commit Hash:</strong> 0d0964b (origin/main)</div>
    <div class="meta-item"><strong>Date:</strong> September 28, 2026</div>
    <div class="meta-item"><strong>Status:</strong> 22 / 22 Items Completed & Verified</div>
  </div>

  <h2 class="section-header">PART A: Subscriber Management & Customer Screen (Items 1–10)</h2>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 01</span>
        <span class="item-title">IPTV Mode Toggle & Add Customer Mode</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added support for <code>isIptvMode</code> state parameter across <code>CustomerScreen.js</code> and <code>AddCustomerScreen.js</code>. When active, the interface dynamically switches forms, package choices, and STB ID fields specifically for IPTV provisioning.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js, src/screens/AddCustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 02</span>
        <span class="item-title">Offline Count Metric & Filter Chips</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Introduced dedicated <code>Offline</code> metric card in telemetry header and added a quick filter pill chip (<code>Offline (Count)</code>) allowing operators to isolate disconnected subscribers in one click.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 03</span>
        <span class="item-title">Status vs Connectivity Column Separation</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Separated Account Lifecycle Status (<code>ACTIVE</code>, <code>EXPIRED</code>, <code>SUSPENDED</code>) from Real-time Network Connectivity (<code>ONLINE</code>, <code>OFFLINE</code>) into two distinct table columns for complete clarity.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 04</span>
        <span class="item-title">Expiration & Balance Days Helper Calculation</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Implemented <code>calculateBalanceDays()</code> utility that computes days remaining until expiry. Displays high-visibility relative indicators such as <code>14 Days Left</code>, <code>Expires Today</code>, or <code>-2 Days Ago Expired</code>.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 05</span>
        <span class="item-title">Interactive ASC / DESC Expiration Date Sorting</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Made the <code>Expiration & Balance</code> table column header interactive. Clicking toggles sorting between ascending and descending dates with arrow indicators (<code>▲ ASC</code> / <code>▼ DESC</code>).
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 06</span>
        <span class="item-title">Direct Dialer Mobile Links & Row Click Isolation</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Converted subscriber phone numbers into clickable <code>tel:</code> links with phone icons for instant mobile dialer launch. Removed row-click redirection when pressing phone numbers to avoid accidental page navigation.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 07</span>
        <span class="item-title">Multi-Field Search & Filtering Engine</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Broadened search engine capabilities to perform simultaneous real-time filtering across Customer Name, Mobile Number, Account Username, Broadband Package Name, STB MAC/ID, IP Address, and Customer ID.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 08</span>
        <span class="item-title">Full Pagination & Rows-Per-Page Selector</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added full pagination bar supporting record range counters (e.g. <code>Showing 1-10 of 245</code>), numeric page selection buttons, Prev/Next navigation, and a dynamic Rows-per-Page selector (10, 25, 50, 100).
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 09</span>
        <span class="item-title">Multi-Role Operator Filter Dropdown</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Integrated an Operator Filter dropdown for Super Admin and Admin role logins, enabling hierarchical filtering of subscribers belonging to specific downstream partners or operators.
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num">ITEM 10</span>
        <span class="item-title">High-Contrast Badge Styles & WCAG Palette</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Redesigned status and connectivity tags with high-contrast background tints and crisp typography (Emerald for Active, Rose for Expired, Amber for Suspended, Blue for Online, Slate Gray for Offline).
    </div>
    <div class="item-files">Affected Files: src/screens/CustomerScreen.js, src/constants/theme.js</div>
  </div>

  <h2 class="section-header">PART B: Partner Management & Operations Console (Items 11–22)</h2>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 11</span>
        <span class="item-title">Debit Wallet Functionality for Partners</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Enhanced Partner Wallet Console with a dual-mode action toggle (<code>+ CREDIT TOPUP</code> vs <code>- DEBIT WALLET</code>). Supports balance validation, custom debit remarks, ledger transaction recording, and red alert styling.
    </div>
    <div class="item-files">Affected Files: src/screens/PartnerScreen.js, src/services/oneBssApi.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 12</span>
        <span class="item-title">KYC Provider Mapping Settings</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added KYC Provider configuration options (<code>Signzy</code>, <code>Decentro</code>, <code>HyperVerge</code>, <code>Karza</code>, <code>Manual KYC</code>, <code>Disabled</code>) across Create Account, Edit Partner form, and Partner Details view.
    </div>
    <div class="item-files">Affected Files: src/components/CreateAccountModal.js, src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 13</span>
        <span class="item-title">IPTV Active Count in Partners List</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added active IPTV subscriber badges (<code>X IPTV Active</code>) alongside Internet counts in both desktop data table rows and mobile card views in <code>PartnerScreen.js</code>.
    </div>
    <div class="item-files">Affected Files: src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 14</span>
        <span class="item-title">Enable / Disable Partner Confirmation Alert Modal</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Replaced direct status toggling with a modal alert (<code>Confirm Partner Status Change</code>) prompting confirmation before enabling or disabling partner account status.
    </div>
    <div class="item-files">Affected Files: src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 15</span>
        <span class="item-title">Partner Location / Region Column</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added operational <code>Region / Location</code> column in the partners main desktop data table and mobile card body view.
    </div>
    <div class="item-files">Affected Files: src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 16</span>
        <span class="item-title">Manual Telemetry Refresh Button</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added a <code>Refresh Telemetry</code> button in the partner list control bar to force live re-fetching of online and active counts with visual feedback.
    </div>
    <div class="item-files">Affected Files: src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 17</span>
        <span class="item-title">IPTV Count Metric Cards below Internet Overview</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Positioned the IPTV Telemetry metric grid (Total Users, Active STBs, Expired STBs) directly underneath the Internet subscriber metric grid in the Partner Details view.
    </div>
    <div class="item-files">Affected Files: src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 18</span>
        <span class="item-title">Account Role Selection Dropdown in Add Partner</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Replaced binary toggle with an interactive role picker in <code>CreateAccountModal.js</code> supporting <code>Operator</code>, <code>Admin Regional</code>, <code>Sub-Operator</code>, and <code>Regional Manager</code> roles.
    </div>
    <div class="item-files">Affected Files: src/components/CreateAccountModal.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 19</span>
        <span class="item-title">Mobile Responsive Add Partner Modal</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Optimized <code>CreateAccountModal.js</code> for small screens (<code>width &lt; 768px</code>) with stacked form groups, responsive paddings, and full-width footer action buttons.
    </div>
    <div class="item-files">Affected Files: src/components/CreateAccountModal.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 20</span>
        <span class="item-title">IPTV Branch Mapping Configuration</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Added <code>IPTV Branch ID / Mapping</code> field to <code>CreateAccountModal.js</code>, Edit Partner form, and Partner Information grid.
    </div>
    <div class="item-files">Affected Files: src/components/CreateAccountModal.js, src/screens/PartnerScreen.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 21</span>
        <span class="item-title">Dashboard IPTV Click Navigation</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Linked IPTV metric cards on <code>DashboardScreen.js</code> to navigate directly to <code>CustomerScreen.js</code> with IPTV subscriber mode active (<code>isIptvMode = true</code>).
    </div>
    <div class="item-files">Affected Files: src/screens/DashboardScreen.js, App.js</div>
  </div>

  <div class="item-card">
    <div class="item-header">
      <div>
        <span class="item-num item-num-blue">ITEM 22</span>
        <span class="item-title">Global Network Offline Alert Banner</span>
      </div>
      <span class="item-badge badge-completed">Completed</span>
    </div>
    <div class="item-desc">
      Implemented a global offline state detector in <code>App.js</code> monitoring <code>navigator.onLine</code> and network events, displaying a top banner and toast warning when internet is unavailable.
    </div>
    <div class="item-files">Affected Files: App.js</div>
  </div>

  <h2 class="section-header">Summary Table of Key Components & Modules</h2>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Component / File</th>
        <th>Items Implemented</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>src/screens/CustomerScreen.js</code></td>
        <td>Items 1, 2, 3, 4, 5, 6, 7, 8, 9, 10</td>
        <td><span class="item-badge badge-completed">Verified</span></td>
      </tr>
      <tr>
        <td><code>src/screens/PartnerScreen.js</code></td>
        <td>Items 11, 12, 13, 14, 15, 16, 17, 20</td>
        <td><span class="item-badge badge-completed">Verified</span></td>
      </tr>
      <tr>
        <td><code>src/components/CreateAccountModal.js</code></td>
        <td>Items 12, 18, 19, 20</td>
        <td><span class="item-badge badge-completed">Verified</span></td>
      </tr>
      <tr>
        <td><code>src/screens/DashboardScreen.js</code></td>
        <td>Item 21</td>
        <td><span class="item-badge badge-completed">Verified</span></td>
      </tr>
      <tr>
        <td><code>App.js</code></td>
        <td>Items 21, 22</td>
        <td><span class="item-badge badge-completed">Verified</span></td>
      </tr>
      <tr>
        <td><code>src/services/oneBssApi.js</code></td>
        <td>Item 11 (Debit Wallet API)</td>
        <td><span class="item-badge badge-completed">Verified</span></td>
      </tr>
    </tbody>
  </table>

  <div class="footer-note">
    OneBSS BSS Platform Specification Document • Generated Automatically via Antigravity Engine • All 22 Items Deployed to Main Branch
  </div>

</body>
</html>
`;

fs.writeFileSync('/Users/srikanthchowdary/onebss_expo/spec_doc.html', htmlContent);

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pdfOutputPath = '/Users/srikanthchowdary/Downloads/OneBSS_22_Changes_Detailed_Specification.pdf';

const cmd = `"${chromePath}" --headless --disable-gpu --print-to-pdf="${pdfOutputPath}" /Users/srikanthchowdary/onebss_expo/spec_doc.html`;
console.log('Generating PDF via Headless Chrome...');
execSync(cmd);
console.log('PDF Generated Successfully at:', pdfOutputPath);
