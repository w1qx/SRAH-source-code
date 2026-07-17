import { ProviderFactory, DEFAULT_FLAGS } from '@/modules/external-sources/infrastructure/providers/provider.factory';

/**
 * demo.ts — a runnable narration of the pull flow for the pitch.
 * Run: npx tsx demo.ts
 * Shows: Nafath verify → GOSI income pull → SIMAH obligations pull → DBR.
 */
async function main() {
  const factory = new ProviderFactory(DEFAULT_FLAGS); // all mocked
  const nationalId = '1089468234';

  console.log('\n=== صُرَّاء — محاكاة تدفّق التحقق والسحب ===\n');

  // 1) Nafath identity
  const nafath = factory.getIdentityProvider();
  const init = await nafath.initiate(nationalId);
  console.log(`[نفاذ] افتح التطبيق ووافق على الرقم: ${init.verificationNumber}`);
  const verified = await nafath.poll(init.transactionId);
  console.log(`[نفاذ] الحالة: ${verified.status} ✓  (المصدر: ${verified.provenance.source}/${verified.provenance.mode})\n`);

  // 2) GOSI income
  const gosi = factory.getIncomeVerificationProvider();
  const emp = await gosi.getEmploymentRecord(nationalId);
  const grossSalary = emp.contributionWage;
  console.log(`[التأمينات] صاحب العمل: ${emp.employerName}`);
  console.log(`[التأمينات] الراتب الإجمالي (الخاضع للاشتراك): ${grossSalary} ريال ✓`);
  console.log(`[التأمينات] مدة الخدمة: ${emp.serviceMonths} شهر  (المصدر: ${emp.provenance.source})\n`);

  // 3) SIMAH obligations
  const simah = factory.getCreditBureauProvider();
  const report = await simah.getCreditReport(nationalId);
  console.log(`[سمة] الدرجة الائتمانية: ${report.creditScore}`);
  console.log(`[سمة] إجمالي الالتزامات الشهرية: ${report.totalMonthlyObligations} ريال ✓`);
  report.activeContracts.forEach((c) =>
    console.log(`        - ${c.type}: ${c.monthlyInstallment} ريال`),
  );

  // 4) The pulled numbers flow straight into DBR
  const requestedInstallment = 2950; // would come from amortization(amount, rate, term)
  const totalInstallments = report.totalMonthlyObligations + requestedInstallment;
  const dbr = (totalInstallments / grossSalary) * 100;
  console.log(`\n[محرّك ساما] DBR = (${totalInstallments} ÷ ${grossSalary}) × 100 = ${dbr.toFixed(1)}%`);
  console.log(`[محرّك ساما] السقف النظامي: 33.33%  →  ${dbr <= 33.33 ? 'ضمن الحد' : 'تجاوز الحد'}\n`);
}

main();
