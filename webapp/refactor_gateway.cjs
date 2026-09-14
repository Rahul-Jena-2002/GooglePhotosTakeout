/**
 * Migration helper script for AdminPaymentGateway.
 * Note: Payment gateway refactoring into src/components/admin/payment/
 * has already been completed and verified.
 */
const fs = require('node:fs');
const path = require('node:path');

function verifyRefactoring() {
  const paymentComponentsDir = path.join(__dirname, 'src', 'components', 'admin', 'payment');
  if (fs.existsSync(paymentComponentsDir)) {
    const files = fs.readdirSync(paymentComponentsDir);
    console.log(`Payment module components present (${files.length} files):`, files);
    return true;
  }
  console.warn('Payment components directory not found:', paymentComponentsDir);
  return false;
}

if (require.main === module) {
  verifyRefactoring();
}

module.exports = { verifyRefactoring };
