// Data tab layout. Source: DMS_X02 DATA_TAB_LAYOUT / DATA_TAB_FIELDS / DATA_TAB_TABLES, DMS_03 §11-§16.
// Section kinds: 'identity' | 'product' | 'contact' | 'email' | 'address' are core (special rendering);
// 'fields' renders a 3-column grid; 'table' renders repeating rows.
import { GENDERS, LANGUAGES, NATIONALITIES, BLOOD_GROUPS } from './masters'

const t = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra })
const bg = (key, label) => t(key, label, 'select', { options: BLOOD_GROUPS })
const dob = (key, label) => t(key, label, 'date', { notFuture: true })

export const IDENTITY_FIELDS = [
  t('first_name', 'First Name', 'text', { required: true, approval: true }),
  t('middle_name', 'Middle Name', 'text', { approval: true }),
  t('last_name', 'Last Name', 'text', { approval: true }),
  t('name_at_birth', 'Name at Birth'),
  dob('date_of_birth', 'Date of Birth'),
  t('time_of_birth', 'Time of Birth', 'time'),
  t('place_of_birth', 'Place of Birth'),
  t('gender', 'Gender', 'select', { options: GENDERS }),
  t('language', 'Language', 'select', { options: LANGUAGES }),
  t('nationality', 'Nationality', 'select', { options: NATIONALITIES }),
  bg('blood_group', 'Blood Group'),
  t('relationship', 'Relationship with Primary', 'relationship', { required: true }),
]

export const DATA_SECTIONS = [
  { key: 'identity', label: 'Identity', kind: 'identity', open: true },
  { key: 'product', label: 'Product Interest', kind: 'product', open: true },
  { key: 'contact', label: 'Contact', kind: 'contact', open: true },
  { key: 'email', label: 'Email', kind: 'email', open: true },
  { key: 'address', label: 'Address', kind: 'address', open: true },
  { key: 'identity_docs', label: 'Identity Documents', kind: 'fields', open: true, // just below Address and open (product owner, 21 Nov 2026)
    fields: [
    t('pan', 'PAN', 'pan'), t('ration_card_no', 'Ration Card No.'), t('passport_no', 'Passport No.'),
    t('passport_valid_till', 'Passport Valid Till', 'date'), t('dl_no', "Driver's License No."),
    t('dl_valid_till', 'License Valid Till', 'date'), t('voter_id_no', "Voter's ID Card No."),
  ] },
  { key: 'medical', label: 'Medical & Donor Details', kind: 'fields', fields: [
    t('organ_donor', 'Organ Donor', 'check'),
    t('organ_donor_id', 'Organ Donor ID', 'text', { showIf: 'organ_donor', requiredIf: 'organ_donor' }),
    t('medical_ailments', 'Medical Ailments (if any)', 'textarea'),
    t('allergies', 'Allergies (if any)', 'textarea'),
  ] },
  { key: 'professional', label: 'Professional', kind: 'fields', fields: [t('designation', 'Designation'), t('industry', 'Industry')] },
  { key: 'spouse', label: 'Spouse', kind: 'fields', fields: [
    t('spouse_name', "Spouse's Name"), bg('spouse_blood_group', 'Spouse Blood Group'), dob('spouse_dob', 'Spouse DOB'), dob('wedding_anniversary', 'Wedding Anniversary'),
  ] },
  { key: 'parents', label: 'Parents', kind: 'fields', fields: [
    t('father_name', "Father's Name"), dob('father_dob', "Father's DOB"), bg('father_blood_group', "Father's Blood Group"),
    t('mother_name', "Mother's Name"), dob('mother_dob', "Mother's DOB"), bg('mother_blood_group', "Mother's Blood Group"),
  ] },
  { key: 'children', label: 'Children', kind: 'fields', fields: [
    t('child1_name', "First Child's Name"), dob('child1_dob', 'First Child DOB'), bg('child1_blood_group', 'First Child Blood Group'),
    t('child2_name', "Second Child's Name"), dob('child2_dob', 'Second Child DOB'), bg('child2_blood_group', 'Second Child Blood Group'),
  ] },
  { key: 'emergency', label: 'Emergency Contact', kind: 'fields', fields: [
    t('ec_name', 'Name'), t('ec_contact_no', 'Contact No.', 'number'), t('ec_work_name', 'At Work - Name'), t('ec_work_contact_no', 'At Work - Contact No.', 'number'),
    t('ec_school1_name', 'At School 1 - Name'), t('ec_school1_contact_no', 'At School 1 - Contact No.', 'number'),
    t('ec_school2_name', 'At School 2 - Name'), t('ec_school2_contact_no', 'At School 2 - Contact No.', 'number'),
  ] },
  { key: 'behavior', label: 'Investor Behavior', kind: 'fields', fields: [
    t('investor_category', 'Investor Category', 'select', { options: ['Trader', 'Investor', 'Others'] }),
    t('trader_type', 'Trader Type', 'select', { options: ['F&O', 'Intraday (Cash)', 'Swing'], showIf: (v) => v.investor_category === 'Trader' }),
    t('investment_experience', 'Investment Experience', 'select', { options: ['Beginner', 'Intermediate', 'Experienced'] }),
    t('financial_goals', 'Financial Goals', 'select', { options: ['Retirement', 'Child Education', 'Home Purchase', 'Wealth Creation', 'Tax Saving', 'Other'] }),
  ] },
  { key: 'incomes', label: 'Incomes', kind: 'table', columns: [
    t('income_type', 'Income Type', 'select', { options: ['Salary', 'Business', 'Rental', 'Interest & Dividends', 'Freelance', 'Other'] }),
    t('income_frequency', 'Frequency', 'select', { options: ['Monthly', 'Annual'] }), t('income_amount', 'Amount', 'currency'),
  ] },
  { key: 'general_info', label: 'General Information', kind: 'table', columns: [
    t('service_type', 'Service Type', 'select', { options: ['Gas Customer No.', 'Electricity Account No.', 'Water Account No.', 'Internet Account No.', 'Set Top Box Subscriber ID'] }),
    t('service_account_no', 'Account/Customer No.'), t('service_provider', 'Service Provider'), t('service_helpline', 'Helpline', 'number'),
  ] },
  { key: 'hospital', label: 'Preferred Hospital', kind: 'fields', fields: [t('hospital_contact_person', 'Contact Person'), t('hospital_contact_no', 'Contact No.', 'number'), t('hospital_address', 'Address', 'textarea')] },
  { key: 'police', label: 'Closest Police Station', kind: 'fields', fields: [t('police_contact_person', 'Contact Person'), t('police_contact_no', 'Contact No.', 'number'), t('police_address', 'Address', 'textarea')] },
  { key: 'helplines', label: 'Emergency/Ambulance Helplines', kind: 'table', columns: [t('helpline_name', 'Name'), t('helpline_number', 'Number', 'number')] },
  { key: 'advisory', label: 'Advisory Contacts', kind: 'table', columns: [
    t('advisory_type', 'Contact Type', 'select', { options: ['Family Doctor', 'Family Dentist', 'Financial Adviser', 'Stock Broker', 'Chartered Accountant', 'Tax Consultant', 'Insurance Consultant'] }),
    t('advisory_name', 'Name'), t('advisory_contact_no', 'Contact No.', 'number'), t('advisory_address', 'Address'),
  ] },
  { key: 'safe_storage', label: 'Safe Storage', kind: 'table', columns: [t('safe_bank_name', 'Bank Name'), t('safe_locker_no', 'Locker No.'), t('safe_key_location', 'Key Location')] },
  { key: 'digital_storage', label: 'Digital & Other Storage', kind: 'fields', fields: [t('digilocker_details', 'Digilocker Details', 'textarea'), t('other_storage', 'Other Storage', 'textarea')] },
  { key: 'physical_records', label: 'Location of Physical Records', kind: 'table', columns: [
    t('record_type', 'Document Type', 'select', { options: ['Bank Passbooks', 'FD Certificates', 'Birth Certificates', 'Marriage Certificates', 'Tax Records', 'Accounting Records', 'Property Title', 'Car Title', 'Other Title', 'Power of Attorney', 'Mortgage', 'Keys'] }),
    t('record_location', 'Location'),
  ] },
  { key: 'will', label: 'Will', kind: 'fields', fields: [
    t('will_exec1_name', 'Executor 1 - Name'), t('will_exec1_mobile', 'Executor 1 - Mobile Number', 'number'), t('will_exec1_email', 'Executor 1 - Email ID', 'email'),
    t('will_exec2_name', 'Executor 2 - Name'), t('will_exec2_mobile', 'Executor 2 - Mobile Number', 'number'), t('will_exec2_email', 'Executor 2 - Email ID', 'email'),
    t('will_other_documents', 'Other Important Documents', 'textarea'),
  ] },
  { key: 'mutual_funds', label: 'Mutual Funds', kind: 'table', columns: [t('mf_folio_no', 'Folio Number'), t('mf_fund_name', 'Name of Fund'), t('mf_applicant', 'Applicant'), t('mf_nominee', 'Nominee'), t('mf_amount_invested', 'Total Amount Invested', 'currency')] },
  { key: 'demat', label: 'Demat/Trading Account', kind: 'table', columns: [t('demat_name', 'Name'), t('demat_dp_id', 'DP ID'), t('demat_customer_id', 'Customer ID'), t('demat_nominee', 'Nominee')] },
  { key: 'bank_accounts', label: 'Bank Accounts', kind: 'table', columns: [t('bank_name', 'Name of Bank'), t('bank_account_no', 'Account No.'), t('bank_customer_id', 'Customer ID'), t('bank_account_type', 'Type of Account'), t('bank_applicant1', '1st Applicant'), t('bank_applicant2', '2nd Applicant'), t('bank_nominee', 'Nominee')] },
  { key: 'fixed_deposits', label: 'Fixed Deposits/Post Office Deposits', kind: 'table', columns: [t('fd_bank_name', 'Name of Bank/PO'), t('fd_certificate_no', 'Certificate No.'), t('fd_amount', 'Amount', 'currency'), t('fd_maturity_date', 'Maturity Date', 'date'), t('fd_nominee', 'Nominee'), t('fd_in_name_of', 'In The Name Of')] },
  { key: 'cards', label: 'Debit/Credit Cards', kind: 'table', columns: [t('card_bank_name', 'Name of Bank'), t('card_no', 'Card No.', 'card'), t('card_expiry', 'Expiry Date', 'month'), t('card_type', 'Type', 'select', { options: ['Debit', 'Credit'] })] },
  { key: 'life_insurance', label: 'Life Insurance', kind: 'table', columns: [t('life_company', 'Name of Company'), t('life_policy_no', 'Policy No.'), t('life_insured_amount', 'Insured Amount', 'currency'), t('life_maturity_date', 'Maturity Date', 'date'), t('life_nominee', 'Nominee'), t('life_beneficiary', 'Beneficiary')] },
  { key: 'health_insurance', label: 'Health Insurance', kind: 'table', columns: [t('health_company', 'Name of Company'), t('health_policy_no', 'Policy No.'), t('health_insured_amount', 'Insured Amount', 'currency'), t('health_end_date', 'End Date', 'date'), t('health_nominee', 'Nominee'), t('health_in_name_of', 'In The Name Of')] },
  { key: 'loans', label: 'Loan/EMI', kind: 'table', columns: [
    t('loan_type', 'Loan Type', 'select', { options: ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Business Loan', 'Loan Against Property', 'Loan Against Securities', 'Other'] }),
    t('loan_lender', 'Lender Name'), t('loan_remaining_tenure', 'Remaining Tenure'), t('loan_emi_amount', 'EMI Amount', 'currency'),
  ] },
  { key: 'other_insurance', label: 'Other Insurance', kind: 'table', columns: [t('oins_company', 'Name of Company'), t('oins_policy_no', 'Policy No.'), t('oins_insured_amount', 'Insured Amount', 'currency'), t('oins_maturity_date', 'Maturity Date', 'date'), t('oins_nominee', 'Nominee')] },
  { key: 'annuities', label: 'Annuities/NPS/VPF/PRAN', kind: 'table', columns: [t('ann_company', 'Name of Company'), t('ann_account_no', 'Policy No./Account No.'), t('ann_amount', 'Amount', 'currency'), t('ann_maturity_date', 'Maturity Date', 'date'), t('ann_nominee', 'Nominee')] },
  { key: 'ppf', label: 'Public Provident Fund', kind: 'table', columns: [t('ppf_bank_branch', 'Bank and Branch'), t('ppf_account_no', 'Account No.'), t('ppf_amount', 'Amount', 'currency'), t('ppf_maturity_date', 'Maturity Date', 'date'), t('ppf_nominee', 'Nominee')] },
  { key: 'epf', label: 'Employee Provident/Pension Fund', kind: 'table', columns: [t('epf_uan', 'UAN'), t('epf_account_no', 'EPF/Pension Account Number'), t('epf_balance', 'EPF Account Balance', 'currency'), t('epf_pension_membership', 'EPF Pension Scheme Membership'), t('epf_nominee', 'Nominee')] },
  { key: 'property', label: 'Property Details', kind: 'table', columns: [t('prop_holder_name', 'Property Holder Name'), t('prop_account_no', 'Property Account Number'), t('prop_address', 'Address'), t('prop_purchase_date', 'Date of Purchase', 'date'), t('prop_nominee', 'Nominee')] },
  { key: 'vehicles', label: 'Vehicle Details', kind: 'table', columns: [t('veh_name_model', 'Name and Model No.'), t('veh_registration_no', 'Registration No.'), t('veh_purchase_date', 'Purchase Date', 'date'), t('veh_dealer', 'Dealer'), t('veh_owners', 'Owner(s)')] },
  { key: 'bonds', label: 'Bonds', kind: 'table', columns: [t('bond_name', 'Name'), t('bond_certificate_no', 'Certificate Number'), t('bond_nominee', 'Nominee'), t('bond_in_name_of', 'In The Name Of')] },
  { key: 'gold', label: 'Gold and Other Assets', kind: 'table', columns: [t('asset_details', 'Details'), t('asset_purchase_date', 'Purchase Date', 'date'), t('asset_amount', 'Amount', 'currency')] },
]

// Fields shown on the Verified (Transaction) side - only platform-sourced values (D03 §17)
export const VERIFIED_FIELDS = ['first_name', 'middle_name', 'last_name', 'date_of_birth', 'gender', 'pan']
