export interface PageGuide {
  title: string;
  why: string;
  helps: string;
  example: string;
  steps: string[];
}

const dashboard: PageGuide = {
  title: 'Dashboard',
  why: 'This is the team desk for the whole catalog. It shows how many companies buy, how many subscriptions are open, and which products need a look.',
  helps: 'You can see a grace period, a hold, or a quiet product before a customer calls. The charts sit next to the latest staff actions, so the desk and the audit stay on one screen.',
  example: 'CRM shows four plans and one open subscriber, Northwind Traders on Growth. The health bar stays green while that subscription is active. If Needs attention is no longer zero, open Customers and check the end date.',
  steps: [
    'Read the four counts across the top: customers, subscriptions, attention, and products.',
    'Compare plans in the catalog with subscribers by product.',
    'Open a product name, or use Customers and Connection lab at the top.',
    'Use Customize if you want the cards in a different order. That layout is saved for your login.',
  ],
};

const products: PageGuide = {
  title: 'Products',
  why: 'The catalog is every Altamid app Control can license. Each row is one product, with its code, status, and how many companies are on it.',
  helps: 'You add a future app here without changing the live products. A draft or a retired product cannot take a new subscription, so a half-ready app stays off the connection path.',
  example: 'Altamid CRM stays active. A new app can be added as a draft with its own code and key tag. Those two stay permanent after the first save. Publish it only when plans and a release are ready.',
  steps: [
    'Scan status, plans, and open subscriptions in the table.',
    'Add a product when you are ready to license a new app.',
    'Open a row to set the connection, plans, subscribers, releases, and settings.',
  ],
};

const product: PageGuide = {
  title: 'Product',
  why: 'One product, with the controls that decide how a customer connects and what they pay.',
  helps: 'Connection, price, subscribers, and releases stay on separate tabs, so a plan change does not get mixed up with a release.',
  example: 'On Altamid CRM, open Plans and you see Growth. Open Subscribers and you see Northwind Traders. A draft release can sit on the Releases tab until you publish it. The code and the key tag do not change.',
  steps: [
    'Connection shows the key tag and how a live install asks for a lease.',
    'Plans sets the seat unit, the term, and the price in INR.',
    'Subscribers lists the companies on this product.',
    'Releases holds draft, published, and yanked builds.',
    'Settings is the product name, summary, and whether it can take new subscriptions.',
  ],
};

const customers: PageGuide = {
  title: 'Customers',
  why: 'A customer is a buying company. One company can hold one subscription for each product.',
  helps: 'The list is the place to find who is active, who is blocked, and who is close to an end date, before you open the company itself.',
  example: 'Northwind Traders is one row. Open it to see the CRM Growth subscription, the seats, and any label or alert on that company. Add a new company from here when a sale is agreed.',
  steps: [
    'Search or sort the table to find the company.',
    'Open the name to see subscriptions, labels, alerts, and behaviour notes.',
    'Add a customer when the company is new. The subscription itself is opened on the customer page.',
  ],
};

const customer: PageGuide = {
  title: 'Customer',
  why: 'This is the company file: who they are, what they subscribe to, and anything the team should notice before the next call.',
  helps: 'Labels highlight the company in lists. Alerts remind you of a date. A block stops a new subscription. Behaviour notes keep the story with the company, not in a chat.',
  example: 'Northwind Traders holds Altamid CRM on Growth, one seat, from 8 Nov 2026 to 8 Dec 2026. A label such as Priority shows on the title. A behaviour note can say they prefer email. Blocking them closes new subscriptions and leaves the reason on the page.',
  steps: [
    'Read the details, then the subscriptions table.',
    'Add a label, an alert, or a behaviour note from the side cards.',
    'Edit the company only when you mean to change the record. Use Block only when new subscriptions must stop.',
    'Open a subscription row to issue a key or change the term.',
  ],
};

const subscription: PageGuide = {
  title: 'Subscription',
  why: 'This is one company’s licence for one product: the plan, the dates, the seats, and the keys that install may use.',
  helps: 'You can see whether it is active, in grace, or expired, issue a key, and reset a binding when a machine must be replaced. The full key is shown only at the moment it is issued.',
  example: 'Northwind Traders on Altamid CRM Growth runs 8 Nov 2026 to 8 Dec 2026. Issue a key, copy it once, and the install checks in from the Connection lab or from the product. If the laptop is replaced, reset the binding and issue again.',
  steps: [
    'Confirm the plan, the term, and the purchase before you issue a key.',
    'Copy a new key immediately. Later screens show only a hint.',
    'Watch the install table for the host, the version, and the last verdict.',
    'Revoke a key that must stop working.',
  ],
};

const revenue: PageGuide = {
  title: 'Revenue',
  why: 'Revenue is the money side of subscriptions: list cost, the offer taken off, and what the company actually purchased.',
  helps: 'You can answer “what did they pay for this term?” without opening each customer. An ended offer still shows on a purchase that already used it.',
  example: 'Northwind Traders on Growth has a list cost of ₹999. If no offer was applied, the purchase stays ₹999 for that term. A later price change does not rewrite this row.',
  steps: [
    'Read the totals for list, offers, and purchases.',
    'Open a row when you need the customer and the plan behind a figure.',
    'Use the Subscriber purchases report when you need the same figures for a date range.',
  ],
};

const coupons: PageGuide = {
  title: 'Coupons',
  why: 'Offers reduce a purchase inside Control. Coupon codes are the codes you can hand to a customer for a payment gateway later.',
  helps: 'Running offers and released codes stay visible so the team can pick one while selling. Creating, changing, or deleting them follows the role. Super Admin can do all of it.',
  example: 'A released offer of 10 percent on Altamid CRM can be chosen when you open Northwind Traders’ subscription. A coupon code such as a festive code can be released for the gateway, and an ended code cannot be used again. Launch 10 is an ended code and stays on record.',
  steps: [
    'Read running offers first, then the coupon codes.',
    'Draft an offer or a code, then release it when it should be pickable.',
    'End a code when the promotion is over. Do not delete a code that a purchase already used.',
  ],
};

const lab: PageGuide = {
  title: 'Connection lab',
  why: 'The lab proves a licence key and the signed lease before any live product is connected.',
  helps: 'A failed check stays in the lab. It does not change CRM, Desk, or any other install. Use it when a key, a clock, or a binding looks wrong.',
  example: 'Paste the key you just issued for Northwind Traders, ask for a lease, and read the verdict. If the lease is allowed, the product can use the same check. If it is refused, the reason is on this page and the live app is untouched.',
  steps: [
    'Paste a key. Do not invent a key for a customer who has no subscription.',
    'Request a lease and read the decision.',
    'If the binding must move to a new machine, reset it on the subscription, then try again here.',
  ],
};

const reports: PageGuide = {
  title: 'Reports',
  why: 'Reports turn the catalog, the customers, and the team’s actions into a register you can print or download.',
  helps: 'Each card is one register. You choose the dates on the next screen, then print a branded letterhead or download a CSV. Full licence keys are never included.',
  example: 'Open Subscription register, keep 1 Nov 2026 to 9 Nov 2026, and you get Northwind Traders on Altamid CRM Growth. Print uses the Altamid letterhead. CSV is the same rows without the paper layout.',
  steps: [
    'Pick the register: subscriptions, customers, keys, installs, catalog, purchases, or team activity.',
    'Set the dates and generate.',
    'Print for paper, or CSV for a spreadsheet.',
  ],
};

const reportGuides: Record<string, PageGuide> = {
  subscriptions: {
    title: 'Subscription register',
    why: 'This register lists who holds which plan, the dates, and whether that subscription is active, in grace, or expired.',
    helps: 'Use it for a month-end list or a customer review. The print layout is the Altamid letterhead, and the on-screen pager stays off the paper.',
    example: 'From 1 Nov 2026 to 9 Nov 2026 the register shows Northwind Traders, Altamid CRM, Growth, active, 8 Nov 2026 to 8 Dec 2026.',
    steps: [
      'Set From and To, then Generate. All dates drops the range.',
      'Print opens paper size, orientation, and row density. Those choices are remembered.',
      'CSV downloads the same rows. The full key is not in either file.',
    ],
  },
  customers: {
    title: 'Customer register',
    why: 'This register lists the companies on file, the contact, and how many subscriptions each one holds.',
    helps: 'You can hand someone a dated list of customers without opening every company.',
    example: 'Northwind Traders appears with its contact and a count of one subscription when the dates cover that company.',
    steps: [
      'Choose the dates and generate.',
      'Print the letterhead or download the CSV.',
    ],
  },
  licenses: {
    title: 'License keys',
    why: 'This register lists issued and revoked keys for the dates you choose.',
    helps: 'You can see which keys exist and which were revoked, without putting a usable key on paper.',
    example: 'A key issued for Northwind Traders shows the hint, the product, and whether it is still issued. The full key is not printed.',
    steps: [
      'Generate for the dates you care about.',
      'Print or download. Treat the file as confidential even though the key itself is hidden.',
    ],
  },
  installs: {
    title: 'Install check-ins',
    why: 'This register lists hosts that checked in, with the version and the last verdict.',
    helps: 'You can see whether a customer’s machine is on the current release, and whether the last lease was allowed.',
    example: 'After a successful lab check or a live check-in, the host, version, and verdict appear for that date.',
    steps: [
      'Generate for the dates of the check-ins you need.',
      'Print or download, then open the subscription if a verdict was refused.',
    ],
  },
  catalog: {
    title: 'Catalog snapshot',
    why: 'This register is the catalog as it stands now: products, seat units, plan counts, and open subscriptions.',
    helps: 'You can file a picture of the catalog on a given day, separate from later plan edits.',
    example: 'Altamid CRM appears with its plans and the one open subscription. A draft product appears with no subscribers.',
    steps: [
      'Generate. The dates still label the paper, and the rows are the catalog now.',
      'Print the letterhead or download the CSV.',
    ],
  },
  revenue: {
    title: 'Subscriber purchases',
    why: 'This register lists list cost, the offer taken off, and what each subscriber purchased.',
    helps: 'You can take a dated money list to a review without adding the figures up from the Revenue screen.',
    example: 'Northwind Traders on Growth shows the list cost and the purchase for that term. An offer used at the time stays on the row after the offer ends.',
    steps: [
      'Set the dates that cover the purchases.',
      'Print or download. Amounts are in INR.',
    ],
  },
  activity: {
    title: 'Team activity',
    why: 'This register lists staff actions in the dates you choose.',
    helps: 'You can show who signed in, who changed a setting, and who issued a key, without scrolling the live audit.',
    example: 'A sign-in by Altamid Owner and a settings change appear as separate rows, with the time and the action. The full key is never written here.',
    steps: [
      'Choose the dates and generate.',
      'Print or download. Open Audit if you need the live list instead.',
    ],
  },
};

const audit: PageGuide = {
  title: 'Audit',
  why: 'Audit is the live record of what the team did in Control: sign-ins, edits, keys, and settings.',
  helps: 'When someone asks who changed a price or who deleted a rule, the answer is a row here. The full licence key is never stored in the audit.',
  example: 'A sign-in shows as Signed in, with the person and the time. Deleting an IP rule shows as its own row. Use Team activity under Reports when you need that list on paper.',
  steps: [
    'Search or sort to find the action.',
    'Read the person, the action, and the time.',
    'Open the related customer or product if you need to undo something. Audit itself does not edit the record.',
  ],
};

const team: PageGuide = {
  title: 'Team',
  why: 'The team is everyone who can sign in to Control. Each person has one role.',
  helps: 'You add a teammate, see who is online, and remove someone who has left. A Super Admin can be edited only after a password and their email are confirmed, and that account cannot be deleted.',
  example: 'Altamid Owner is Super Admin and stays on the list. Add a support teammate with the Support role when they should see customers but not change settings. Their status can be Online, Busy, Away, or one of the other desk states.',
  steps: [
    'Read name, role, and status in the table.',
    'Add a teammate on the next page and choose their role.',
    'Edit a row to change the role or the person. Delete only when that person must lose access, and never the Super Admin.',
  ],
};

const teammate: PageGuide = {
  title: 'Teammate',
  why: 'This page is the form for one person: name, email, role, and the password they will use.',
  helps: 'A new person starts with the role you pick, so they see only the menus that role allows. Editing a Super Admin asks for your password and their email before the save.',
  example: 'Add a teammate with the Viewer role when they should look but not change records. Leave Super Admin for the owner account. After they sign in, they set their own presence and photo on My profile.',
  steps: [
    'Enter the name and a real email. The email is also used for a password code.',
    'Choose one role. Super Admin is not a role you assign here.',
    'Set a password of at least 10 characters for a new person.',
    'Save, then ask them to sign in and open My profile.',
  ],
};

const roles: PageGuide = {
  title: 'Roles',
  why: 'A role is the set of screens and actions a person is allowed to use.',
  helps: 'Super Admin always has every control. Admin starts with full access. Any other role can be limited to the job, so a viewer cannot issue keys or change settings.',
  example: 'Support can open customers and still be refused on Settings. Viewer can look at the catalog and not add a product. Create a Store-style role only if that job needs a smaller set than Admin.',
  steps: [
    'Read the built-in roles before you add another.',
    'Add a role, name it for the job, and tick only what that job needs.',
    'Assign it on the teammate page. A person uses one role.',
  ],
};

const role: PageGuide = {
  title: 'Role',
  why: 'This page is one role: its name, the people who use it, and the permissions ticked for that job.',
  helps: 'You can see the effect of a tick before you save. Super Admin stays complete and cannot be reduced. A person picks up the change the next time Control checks their role.',
  example: 'On Support, customers can stay ticked and settings can stay off. The people list shows who would lose or gain that screen. Untick Delete if that job should not remove records.',
  steps: [
    'Rename the role only when the job name is wrong. Do not rename Super Admin.',
    'Tick the screens and the actions the job needs, then save.',
    'Check the people list so you know who is affected.',
  ],
};

const settingsGeneral: PageGuide = {
  title: 'Workspace settings',
  why: 'General settings are the company name, the support email, the website, and the city used for the forecast beside the clock.',
  helps: 'The name and the city also appear on printed reports. A blank city uses Kolkata, so the forecast still has a place.',
  example: 'Company Altamid Solutions, website https://altamidsolutions.com, city Kolkata, and country India. The clock then shows Kolkata weather. Change the city when the desk moves, and leave the support email for mail that should show a reply address.',
  steps: [
    'Fill company, support email, website, city, and country.',
    'Save workspace. The print letterhead uses these values.',
    'Use the other tabs for email, IP access, and login places.',
  ],
};

const settingsEmail: PageGuide = {
  title: 'Email settings',
  why: 'Email settings are the SMTP accounts Control uses for staff codes, customer notices, and general mail.',
  helps: 'You can keep more than one sender, and choose which account is used for which purpose. A saved app password stays hidden after the first save.',
  example: 'Add one Gmail account for staff password codes and another for customer notices. Mark one as the default. Until an account is chosen, staff codes still use the server mail.',
  steps: [
    'Add an account with host, port, encryption, and the from address.',
    'Save the password once. It is not shown again.',
    'Choose which account sends staff, customer, and general mail.',
  ],
};

const settingsAccess: PageGuide = {
  title: 'IP access',
  why: 'IP access decides which networks may sign in when you turn allow-listing on.',
  helps: 'Left off, the desk can sign in from the usual networks. Turned on, only listed addresses get in. Super Admin is never locked out by an IP rule.',
  example: 'Leave the mode off for normal work. Add the office address and label it Office before you switch to allow, and keep your own current IP on the list. A blocked address is refused at sign-in.',
  steps: [
    'Read the current IP before you add a rule.',
    'Add an allow or block rule with a label you will recognise.',
    'Turn allow mode on only after the office addresses are listed.',
  ],
};

const settingsLocations: PageGuide = {
  title: 'Login locations',
  why: 'Login locations are the places a role or a teammate must be inside when location checks are on.',
  helps: 'You can require the office for a role, and still grant one person a temporary override. Super Admin is never locked out by a place.',
  example: 'Add the Kolkata office with a radius, assign it to a role, and leave the check off until the place is right. An override can let one teammate sign in from elsewhere until the time you set.',
  steps: [
    'Add a place with a name, a map point, and a radius.',
    'Choose the roles or people who must be inside it, and the days and hours.',
    'Turn the check on only after a test sign-in from that place succeeds.',
  ],
};

const profile: PageGuide = {
  title: 'My profile',
  why: 'My profile is your own name, photo, desk status, and password.',
  helps: 'Teammates see the status you set, and the photo on the menu. A change to this page asks for your password or a code sent to your email before it is saved, so someone at an open desk cannot rewrite it.',
  example: 'Set Online while you are at the desk, Busy on a call, or Away when you step out. Change the password here when you want a new one. The code option is the same email as your sign-in.',
  steps: [
    'Update the photo or the details, then confirm with your password or the email code.',
    'Set your status, or leave it to follow sign-in and idle time.',
    'Change the password from the side card. It must be at least 10 characters.',
  ],
};

const manual: PageGuide = {
  title: 'User manual',
  why: 'The manual is the short tour of each menu, in the same order as the sidebar.',
  helps: 'Use it when you want the whole map. Use the info button on a page when you are already there and want the example for that screen.',
  example: 'Open Customers in the manual, then use the link to the live Customers page. The info button on that page repeats the job of the screen with a worked example.',
  steps: [
    'Read the section for the menu you are about to use.',
    'Follow the link to the live page.',
    'On that page, use the info button beside the title for the example and the steps.',
  ],
};

export function guideForPath(url: string): PageGuide | null {
  const path = (url.split('?')[0].replace(/\/+$/, '') || '/');
  if (path === '/' ) return dashboard;
  if (path === '/products') return products;
  if (path.startsWith('/products/')) return product;
  if (path === '/customers') return customers;
  if (path.startsWith('/customers/')) return customer;
  if (path === '/revenue') return revenue;
  if (path === '/coupons') return coupons;
  if (path.startsWith('/subscriptions/')) return subscription;
  if (path === '/lab') return lab;
  if (path === '/reports') return reports;
  if (path.startsWith('/reports/')) {
    const type = path.slice('/reports/'.length);
    return reportGuides[type] ?? reports;
  }
  if (path === '/audit') return audit;
  if (path === '/team') return team;
  if (path === '/team/new' || /^\/team\/[^/]+$/.test(path)) return teammate;
  if (path === '/roles') return roles;
  if (path.startsWith('/roles/')) return role;
  if (path === '/settings' || path === '/settings/general') return settingsGeneral;
  if (path === '/settings/email') return settingsEmail;
  if (path === '/settings/access') return settingsAccess;
  if (path === '/settings/locations') return settingsLocations;
  if (path === '/profile') return profile;
  if (path === '/manual') return manual;
  return null;
}
