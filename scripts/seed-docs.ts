/** Realistic sample documents used to demo the vault. */
export const SAMPLE_DOCS: { filename: string; mime: string; text: string }[] = [
  {
    filename: "meridian-auto-insurance-policy.txt",
    mime: "text/plain",
    text: `MERIDIAN MUTUAL INSURANCE COMPANY
AUTOMOBILE INSURANCE POLICY — DECLARATIONS PAGE

Policy Number: HXA-4471902
Insured: Daniel Okafor
Address: 218 Lakeshore Road, Mississauga, Ontario
Effective Date: {{D-150}}
Expiry Date: {{D+215}}
Annual Premium: $1,842.00
Collision Deductible: $500.00
Comprehensive Deductible: $250.00

INSURED VEHICLE
2021 Toyota RAV4 XLE
VIN: 2T3W1RFV8MC123456
Annual mileage estimate: 14,000 km

COVERAGE SUMMARY
Third Party Liability coverage is provided up to a limit of $2,000,000 per occurrence.
Accident Benefits are provided in accordance with the statutory minimum schedule.
Direct Compensation Property Damage applies with a deductible of $0.00.
Collision coverage applies to the described automobile subject to the deductible shown above.

CONDITIONS
The insured shall indemnify the underwriter against any misrepresentation made at the time of application.
Notwithstanding any other provision, coverage may be voided where premium remains unpaid for 30 days.
Any dispute arising under this contract shall be resolved by arbitration in the jurisdiction of Ontario.
Renewal is automatic unless written notice is provided 30 days prior to the expiry date.

Claims: claims@meridianmutual.example or (416) 555-0142.`,
  },
  {
    filename: "northgate-bank-statement.txt",
    mime: "text/plain",
    text: `NORTHGATE BANK
MONTHLY CHEQUING ACCOUNT STATEMENT

Account Number: ****8871
Statement Period: {{D-45}} to {{D-15}}
Prepared for: Daniel Okafor
Branch: Port Credit, Mississauga

Opening Balance: $4,218.55
Total Deposits: $6,430.00
Total Withdrawals: $5,127.84
Closing Balance: $5,520.71

TRANSACTION DETAIL
{{D-44}}  Payroll Deposit — Ardent Systems Inc     $3,215.00
{{D-42}}  Pre-authorized Debit — Meridian Mutual    $153.50
{{D-39}}  Grocery Purchase — Fairway Market          $212.44
{{D-35}}  Transfer to Savings                        $800.00
{{D-32}}  Utility Payment — Peel Hydro               $148.90
{{D-30}}  Payroll Deposit — Ardent Systems Inc     $3,215.00
{{D-25}}  Mortgage Payment — Northgate Bank        $2,104.00
{{D-19}}  Interest Earned                              $3.12

The interest rate applied to this account is 1.85% per annum on the daily closing balance.
Please review this statement and report any discrepancy within 30 days of the statement date.`,
  },
  {
    filename: "ardent-systems-employment-offer.txt",
    mime: "text/plain",
    text: `ARDENT SYSTEMS INC.
OFFER OF EMPLOYMENT

Date: {{D-550}}
Employee: Daniel Okafor
Personal email: daniel.okafor@example.com
Phone: (905) 555-0177
Position: Senior Data Engineer
Reporting to: Director of Platform Engineering
Start Date: {{D-524}}

COMPENSATION
Your annual base salary will be $128,000.00, paid semi-monthly through payroll deposit.
You will be eligible for an annual performance bonus targeted at 12% of base salary.
You will receive a one-time signing bonus of $8,000.00, payable on your first pay date.

EQUITY
You will be granted 4,000 restricted stock units subject to a four-year vesting schedule
with a one-year cliff. Vesting commences on your start date.

BENEFITS
Comprehensive health, dental, and vision coverage begins on your start date.
The company contributes 5% of base salary to a matched retirement savings plan.
You are entitled to 20 days of paid vacation annually plus 8 personal days.

TERMS
This offer is contingent upon satisfactory completion of a background check.
Employment is subject to a probationary period of 3 months from the start date.
Either party may terminate this agreement with 4 weeks written notice.
Please sign and return this letter by {{D-538}} to accept.

Human Resources: hr@ardentsystems.example`,
  },
  {
    filename: "passport-renewal-notice.txt",
    mime: "text/plain",
    text: `GOVERNMENT PASSPORT SERVICES
PASSPORT RENEWAL NOTICE

Holder: Daniel Okafor
Passport Number: AB4419023
Nationality: Canadian
Date of Birth: April 22, 1989
Place of Issue: Toronto
Date of Issue: {{D-9y}}
Expiry Date: {{D+240}}

IMPORTANT
Your passport expires on the date shown above. Many countries require that your passport
remain valid for at least six months beyond your intended date of return. You are advised
to renew no later than {{D+60}} to avoid disruption to travel plans.

Renewal requires a completed application form, two identical photographs taken within the
last twelve months, your current passport, and the applicable fee of $160.00.

Processing times are approximately 20 business days for standard service.
Enquiries: passports@gov.example or (800) 555-0199.`,
  },
  {
    filename: "harbourview-residential-lease.txt",
    mime: "text/plain",
    text: `RESIDENTIAL TENANCY AGREEMENT

THIS AGREEMENT is made on {{D-100}} between Harbourview Properties Ltd (the "Landlord")
and Daniel Okafor (the "Tenant").

PREMISES
The Landlord leases to the Tenant the residential premises at 218 Lakeshore Road, Unit 1204,
Mississauga, Ontario, comprising approximately 940 square feet.

TERM
The tenancy commences on {{D-90}} and continues for a fixed term of twelve months,
terminating on {{D+275}}, whereafter it continues month to month unless terminated.

RENT
The Tenant shall pay rent of $2,350.00 per month, due on the first day of each month.
A last month's rent deposit of $2,350.00 has been collected and is held by the Landlord.
Rent not received within five days of the due date shall accrue interest at 2% per month.

OBLIGATIONS
The Tenant covenants to maintain the premises in good condition, reasonable wear excepted.
The Tenant shall not assign or sublet the premises without written consent of the Landlord.
The Landlord shall provide 24 hours written notice prior to entry except in an emergency.
The Tenant shall indemnify the Landlord against damage caused by negligence of the Tenant.

Notwithstanding the foregoing, this agreement is governed by the residential tenancy
legislation of the jurisdiction in which the premises are located, and any provision
inconsistent with that legislation is severable and of no force.

Landlord contact: leasing@harbourview.example`,
  },
  {
    filename: "riverside-clinic-lab-results.txt",
    mime: "text/plain",
    text: `RIVERSIDE MEDICAL CLINIC
LABORATORY RESULTS REPORT

Patient: Daniel Okafor
Date of Birth: April 22, 1989
Ordering Physician: Dr. Amara Chen
Collection Date: {{D-25}}
Report Date: {{D-22}}
Accession: RC-{{Y+0}}-88421

COMPLETE BLOOD COUNT
Hemoglobin            148 g/L      Reference range 130 - 170
White Blood Cells     6.2 x10^9/L  Reference range 4.0 - 11.0
Platelets             241 x10^9/L  Reference range 150 - 400

LIPID PANEL
Total Cholesterol     5.4 mmol/L   Reference range below 5.2
LDL Cholesterol       3.4 mmol/L   Reference range below 3.4
HDL Cholesterol       1.2 mmol/L   Reference range above 1.0
Triglycerides         1.8 mmol/L   Reference range below 1.7

METABOLIC
Fasting Glucose       5.6 mmol/L   Reference range 3.9 - 5.6

INTERPRETATION
Total cholesterol is marginally above the reference range. Dietary modification and
increased physical activity are recommended. A follow-up lipid panel should be
scheduled in six months. Repeat testing is due by {{D+160}}.
No critical values were identified in this specimen.

Prescription issued: Atorvastatin 10 mg once daily, 90 day supply, two refills.`,
  },
  {
    filename: "peel-hydro-electricity-bill.txt",
    mime: "text/plain",
    text: `PEEL HYDRO UTILITIES
ELECTRICITY BILL

Account Number: 55-209-8834
Service Address: 218 Lakeshore Road Unit 1204, Mississauga
Billing Period: {{D-40}} to {{D-11}}
Invoice Number: PH-{{Y+0}}-061204
Due Date: {{D+9}}

METER READING
Previous reading: 41,208 kWh
Current reading: 41,801 kWh
Total usage: 593 kWh

CHARGES
Off-peak usage 312 kWh at $0.087        $27.14
Mid-peak usage 141 kWh at $0.122        $17.20
On-peak usage 140 kWh at $0.182         $25.48
Delivery charge                          $42.55
Regulatory charge                         $3.90
Total before tax                        $116.27
HST 13%                                  $15.12
TOTAL AMOUNT DUE                        $131.39

Payment received after the due date is subject to a late payment charge of 1.5% monthly.
Enrol in pre-authorized payment to avoid missing a due date.`,
  },
  {
    filename: "tax-return-summary.txt",
    mime: "text/plain",
    text: `NOTICE OF ASSESSMENT — {{Y-1}} TAX YEAR

Taxpayer: Daniel Okafor
Tax Year: {{Y-1}}
Assessment Date: {{D-120}}
Reference Number: NOA-{{Y-1}}-771043

INCOME SUMMARY
Employment income (T4)                 $121,400.00
Investment income                        $2,180.00
Total income                           $123,580.00

DEDUCTIONS
Registered retirement contributions      $14,200.00
Union and professional dues                 $840.00
Total deductions                         $15,040.00
Taxable income                         $108,540.00

TAX CALCULATION
Federal tax                             $18,932.00
Provincial tax                           $9,104.00
Total tax payable                       $28,036.00
Total tax withheld at source            $29,410.00
REFUND ISSUED                            $1,374.00

Your refund was deposited on {{D-112}}.
Retain this notice and all supporting slips for a period of six years.
The deadline to file an objection to this assessment is {{D+30}}.
Your unused contribution room carried forward is $31,600.00.`,
  },
  {
    filename: "software-consulting-agreement.txt",
    mime: "text/plain",
    text: `MASTER SERVICES AGREEMENT

THIS AGREEMENT is entered into as of {{D-180}} by and between Ardent Systems Inc,
a corporation having its principal place of business in Toronto (the "Client"), and
Okafor Data Consulting (the "Provider").

1. SERVICES
The Provider shall render data engineering and advisory services as described in each
statement of work executed by the parties hereunder. Each statement of work shall be
incorporated into and governed by the terms of this agreement.

2. COMPENSATION
The Client shall pay the Provider at the rate of $145.00 per hour. Invoices are payable
net 30 from the date of issue. Amounts remaining unpaid after the due date shall accrue
interest at the rate of 1.5% per month.

3. CONFIDENTIALITY
Each party acknowledges that it may receive confidential information of the other party.
The receiving party shall not disclose such confidential information to any third party
and shall protect it using no less than a reasonable standard of care. This obligation
of confidentiality survives termination of this agreement in perpetuity.

4. INTELLECTUAL PROPERTY
All deliverables created by the Provider in the performance of the services shall vest
in the Client upon full payment. The Provider retains ownership of pre-existing materials.

5. INDEMNIFICATION
The Provider shall indemnify and hold harmless the Client from any claim arising out of
the gross negligence or wilful misconduct of the Provider, provided that the aggregate
liability of the Provider shall not exceed the fees paid in the preceding twelve months.

6. TERM AND TERMINATION
This agreement commences on the effective date and continues until {{D+185}},
whereafter it renews for successive one-year terms unless either party gives written
notice of non-renewal at least 60 days prior to the end of the then-current term.
Either party may terminate for material breach upon 30 days written notice.

7. GENERAL
This agreement shall be governed by the laws of the jurisdiction of Ontario. Any dispute
shall be submitted to binding arbitration. If any provision is held unenforceable, the
severability of the remaining provisions shall not be affected. Neither party shall be
liable for delay caused by force majeure.`,
  },
  {
    filename: "apex-electronics-receipt.txt",
    mime: "text/plain",
    text: `APEX ELECTRONICS
PURCHASE RECEIPT

Order Number: AE-884120
Date: {{D-12}}
Store: Square One, Mississauga
Cashier: Terminal 04

ITEMS
1 x UltraWide Monitor 34in        $749.99
1 x Mechanical Keyboard             $189.00
2 x USB-C Cable 2m                   $24.98
1 x Extended Warranty 3yr           $129.00

Subtotal                            $1,092.97
Sales tax 13%                         $142.09
TOTAL                               $1,235.06

Payment method: Credit card ending 4419
Approved — Auth 004821

RETURNS AND WARRANTY
Items may be returned within 30 days of purchase with this receipt in original packaging.
The extended warranty provides coverage for parts and labour for three years from the
date of purchase, expiring on {{D+3y}}. Register your warranty within 90 days at
warranty@apexelectronics.example to activate coverage.`,
  },
];
