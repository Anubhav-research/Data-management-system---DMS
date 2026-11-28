// Master / dropdown values. Source: DMS_X06_Dropdown_and_Status_Master, DMS_X02_Field_Dictionary,
// DMS_X01 TIMERS_LIMITS. Where sources conflict, see 03_Analysis/OPEN_QUESTIONS.md (ID in comment).

export const ROLES = ['IS', 'TL', 'VP', 'President', 'Admin']
export const ROLE_LABEL = {
  IS: 'Investment Specialist',
  TL: 'Team Leader',
  VP: 'Vice President',
  President: 'President',
  Admin: 'Admin',
}

// Investor DMS stages (split prompt §7): only people registered on the Transaction Platform. No Pool, Prospects or Leads.
export const STAGES = ['Investor']
export const STAGE_MODULE = { Investor: 'Investors', Unassigned: 'Unassigned Investors', Junk: 'Junk' }
export const STAGE_ROUTE = { Investor: '/investors', Unassigned: '/unassigned', Junk: '/junk' }

// X01 TIMERS_LIMITS / X05 TIMERS
export const LIMITS = {
  POOL_BATCH: 20, // POOL-002
  INACTIVE_POOL_DAYS: 30, // POOL-007
  PL_INACTIVITY_DAYS: 90, // PL-004
  PL_CAP_DAYS: 730, // PL-005
  PL_LIMIT: 1500, // PL-003
  PROSPECT_INVESTOR_DAYS: 90, // INV-002
  ACTIVE_MONTHS: 6, // INV-003
  INACTIVE_TO_UNASSIGNED_MONTHS: 18, // INV-004
  REASSIGNED_INACTIVE_MONTHS: 12, // INV-009
  MSG_WINDOW_HOURS: 12, // MSG-001
  CUSTOM_REPLY_HOURS: 24, // MSG-007
  WARNING_DAYS: 7,
  PIN_HOME: 5, // NOTE-007
  PIN_CLIENT: 3, // NOTE-007
  CONTACT_ROWS: 10, // D03 §12.3
  ADDRESS_ROWS: 10, // D03 §12.5
  // D06 §6.2.2 system Junk rules ("The thresholds (20, 20, 5, 30 and 5) are system settings", §6.2.3)
  JUNK_NOT_CONNECTED: 20, // A1: 20 Pool calls that didn't connect
  JUNK_NOT_INTERESTED: 20, // A2: 20 connected Pool calls with outcome Not Interested
  DEAD_NUMBER_REPORTS: 5, // A3: a number is dead after 5 Invalid Number / Wrong Number reports
  JUNK_POOL_CALLS: 30, // A4: 30 Pool calls of any kind, never converted
  JUNK_RELEASES: 5, // A5: 5 Release to Pool from Prospect / Lead
}

// X06 CALL_STATUS / CALL_SUBSTATUS_BY_STAGE
export const NOT_CONNECTED_REASONS = ['Ringing', 'Busy', 'Out of Circle', 'Invalid Number', 'Congestion', 'Switched Off', 'Out of Coverage', 'Reject']
export const CALL_OUTCOMES = {
  // Investor list only (X06; split prompt §7.2.10)
  Investor: ['Disconnected', 'Followup', 'Not Interested', 'Passive Communication', 'Interested'],
}
export const EVENT_REQUIRED_OUTCOMES = ['Followup', 'Interested'] // CALL-013
export const WINDOW_OUTCOMES = { Investor: ['Followup', 'Passive Communication', 'Interested'] } // MSG-001

// No Convert in Investor DMS: there is no path back to Prospect DMS (split prompt §7.2.2)
export const CONVERT_OPTIONS = {}

export const INV_STATUS = ['Prospect', 'Active', 'Inactive']
/** Dashboard AUM bands (docs/DASHBOARD_SPEC.md §4): [label, from, to) in rupees. */
export const AUM_BANDS = [['Below ₹1 L', 0, 1e5], ['₹1–5 L', 1e5, 5e5], ['₹5–25 L', 5e5, 25e5], ['₹25 L and above', 25e5, Infinity]]

// X02 / D03 §12
export const GENDERS = ['Female', 'Male', 'Transgender', 'Others']
export const LANGUAGES = ['Hindi', 'English', 'Marathi', 'Gujarati', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Punjabi', 'Urdu', 'Odia', 'Others']
export const NATIONALITIES = ['Indian', 'American (USA)', 'British (UK)', 'Canadian', 'Australian', 'Singaporean', 'UAE National', 'Others']
export const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Not Known']
export const CONTACT_TYPES = ['Office', 'Residence', 'Others']
export const ADDRESS_TYPES = ['Present', 'Permanent', 'Office', 'Correspondence', 'Others']
// OPEN_QUESTIONS D3 - values seen in Figma; source says free text
export const RELATIONSHIPS = ['Spouse', 'Wife', 'Husband', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Reference', 'Other']

export const PRODUCT_INTEREST = [
  { key: 'pi_mf_equity_hybrid', label: 'MF Equity / Hybrid', short: 'MF Equity' },
  { key: 'pi_mf_debt', label: 'MF Debt', short: 'MF Debt' },
  { key: 'pi_mf_sif', label: 'MF SIF', short: 'MF SIF' },
  { key: 'pi_mf_gift_city', label: 'MF Gift City', short: 'MF Gift City' },
  { key: 'pi_fd', label: 'Fixed Deposit (FD)', short: 'FD' },
  { key: 'pi_rbi_bond', label: 'RBI Bond', short: 'RBI Bond' },
  { key: 'pi_capital_gain_bond', label: 'Capital Gain Bond', short: 'Capital Gain Bond' },
  { key: 'pi_ncd', label: 'NCD', short: 'NCD' },
  { key: 'pi_others', label: 'Others', short: 'Others' },
]

// X06 Customer_Type - derived from PAN 4th letter (OPEN_QUESTIONS D4)
export const CUSTOMER_TYPE_BY_PAN = {
  P: 'Individual', C: 'Company', H: 'Hindu Undivided Family (HUF)', F: 'Firm / LLP', A: 'Association of Persons (AoP)',
  B: 'Body of Individuals (BOI)', T: 'Trust (AOP Trust)', G: 'Government Agency', L: 'Local Authority', J: 'Artificial Juridical Person',
}

// X06 / D05 §4.2 - event types and colours
export const EVENT_TYPES = [
  { value: 'Call Follow-up', color: 'blue' },
  { value: 'Video Conference', color: 'violet' },
  { value: 'In-Person Meeting', color: 'green' },
  { value: 'Internal Meeting', color: 'orange' },
  { value: 'Other', color: 'gray' },
]
export const EVENT_COLOR = Object.fromEntries(EVENT_TYPES.map((e) => [e.value, e.color]))

// D05 §3 / X02 TASK
export const TASK_PRIORITIES = ['Low', 'Medium', 'High']
export const TASK_STATUSES = ['To-Do', 'In Progress', 'Completed', 'Rejected'] // Expired is system-set (TASK-005)

// D05 §6 / X02 DEAL_PRODUCT_ROW
export const DEAL_PRODUCTS = ['MF Equity', 'MF Debt', 'MF SIF', 'MF Gift City', 'FD', 'NCD', 'RBI Bond', 'Capital Gain Bond']
export const DEAL_STATUSES = ['Scheduled', 'Completed', 'Rejected'] // Expired system-set (DEAL-009)
export const DEAL_STATUS_THEME = { Scheduled: 'blue', Completed: 'green', Rejected: 'red', Expired: 'red' }
// Product masters (fictional demo values; maintainer is an open question E6)
export const AMCS = {
  '360 ONE Mutual Fund': ['360 ONE Quant Fund - Regular', '360 ONE Flexicap Fund - Regular'],
  'Northwind Mutual Fund': ['Northwind Flexi Cap Fund', 'Northwind Short Duration Fund'],
  'Bluestone Mutual Fund': ['Bluestone Large Cap Fund', 'Bluestone Liquid Fund'],
}
export const FD_COMPANIES = ['Bajaj Finance', 'Shriram Finance', 'Mahindra Finance']
export const FD_TENURES = ['1 Year', '2 Years', '3 Years', '5 Years']
export const NCD_ISSUERS = ['Muthoot Finance', 'IIFL Finance', 'Shriram Finance']

export const WA_STATUSES = ['Sent', 'Delivered', 'Read', 'Failed', 'Invalid Number', 'Not on WhatsApp']
export const EMAIL_STATUSES = ['Sent', 'Delivered', 'Opened', 'Bounced']
export const WA_TEMPLATES = [
  { name: 'followup_intro_v1', body: 'Hello {name}, thank you for speaking with Money Honey today. Your Investment Specialist will share the details discussed.' },
  { name: 'portfolio_rebalance_v2', body: 'Dear {name}, as discussed, here is a summary of the portfolio review options. Reply to this message for any queries.' },
  { name: 'sip_reminder_alert', body: 'Hi {name}, a gentle reminder about the SIP discussion we had. Your specialist is available for any questions.' },
]
export const EMAIL_TEMPLATES = [
  { name: 'q3_portfolio_statement', subject: 'Your Portfolio Summary', body: 'Dear {name},\n\nPlease find the summary of our discussion attached.\n\nRegards,\nMoney Honey Financial Services' },
  { name: 'meeting_followup', subject: 'Follow-up on our call', body: 'Dear {name},\n\nThank you for your time today. As discussed, we will connect again at the scheduled time.\n\nRegards,\nMoney Honey Financial Services' },
]

// D06 §9.6 user switches + starting values §9.8
export const USER_SWITCHES = [
  { key: 'wa_template', label: 'WhatsApp: Send Template', desc: 'Allows dispatching pre-approved WhatsApp message templates.' },
  { key: 'wa_custom', label: 'WhatsApp: Send Custom Message', desc: 'Free-text messaging directly to clients via WhatsApp gateway.' },
  { key: 'wa_document', label: 'WhatsApp: Send Documents', desc: 'Send files from the Document Repository or the computer to clients on WhatsApp (only within 24 hours of a client reply).' },
  { key: 'email_template', label: 'Email: Send Template', desc: 'Permits generating and sending verified brand email templates.' },
  { key: 'email_custom', label: 'Email: Send Custom Message', desc: 'Authorizes composing customized raw emails to customers.' },
  { key: 'create_prospect', label: 'Create Prospect', desc: 'Ability to add new prospects.' },
  { key: 'play_recordings', label: 'Play Call Recordings', desc: 'Access and stream recorded audit and support calls.' },
]
export const DEFAULT_SWITCHES = {
  IS: { dms: true, wa_template: true, wa_custom: false, wa_document: true, email_template: true, email_custom: false, create_prospect: true, play_recordings: false },
  TL: { dms: true, wa_template: true, wa_custom: false, wa_document: true, email_template: true, email_custom: false, create_prospect: true, play_recordings: true },
  VP: { dms: true, wa_template: true, wa_custom: false, wa_document: true, email_template: true, email_custom: false, create_prospect: true, play_recordings: true }, // own (personal) Prospects only
  President: { dms: true, wa_template: true, wa_custom: false, wa_document: true, email_template: true, email_custom: false, create_prospect: true, play_recordings: true }, // own (personal) Prospects only
  Admin: { dms: true, wa_template: false, wa_custom: false, wa_document: false, email_template: false, email_custom: false, create_prospect: true, play_recordings: true },
}

export const CITIES = [
  ['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'], ['Patna', 'Bihar'], ['Jaipur', 'Rajasthan'], ['Chennai', 'Tamil Nadu'],
  ['New Delhi', 'Delhi'], ['Ahmedabad', 'Gujarat'], ['Lucknow', 'Uttar Pradesh'], ['Chandigarh', 'Punjab'], ['Bhopal', 'Madhya Pradesh'],
  ['Hyderabad', 'Telangana'], ['Kochi', 'Kerala'], ['Bengaluru', 'Karnataka'], ['Indore', 'Madhya Pradesh'], ['Kolkata', 'West Bengal'],
]
