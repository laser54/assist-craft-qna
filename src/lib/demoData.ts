import type { QAPair } from "@/pages/QAManagement";

export const demoQAPairs: QAPair[] = [
  {
    id: "demo-1",
    question: "How do I reset my password?",
    answer: "To reset your password:\n1. Click on 'Forgot Password' on the login page\n2. Enter your email address\n3. Check your email for a reset link\n4. Click the link and create a new password\n5. Your password must be at least 8 characters long and include a number",
  },
  {
    id: "demo-2",
    question: "What are the system requirements?",
    answer: "Minimum system requirements:\n- Windows 10 or macOS 10.14+\n- 8GB RAM\n- 2GB free disk space\n- Internet connection\n- Modern web browser (Chrome, Firefox, Safari, or Edge)\n\nRecommended:\n- 16GB RAM for optimal performance\n- SSD storage",
  },
  {
    id: "demo-3",
    question: "How can I contact support?",
    answer: "You can contact our support team through:\n- Email: support@example.com (Response within 24 hours)\n- Live Chat: Available Mon-Fri 9AM-6PM EST\n- Phone: +1-800-123-4567\n- Support Portal: https://support.example.com\n\nFor urgent issues, please use the phone line or live chat.",
  },
  {
    id: "demo-4",
    question: "What payment methods do you accept?",
    answer: "We accept the following payment methods:\n- Credit/Debit cards (Visa, Mastercard, American Express)\n- PayPal\n- Bank transfers\n- Cryptocurrency (Bitcoin, Ethereum)\n\nAll payments are processed securely through our payment gateway. Subscriptions auto-renew unless cancelled.",
  },
  {
    id: "demo-5",
    question: "How do I cancel my subscription?",
    answer: "To cancel your subscription:\n1. Log into your account\n2. Go to Settings > Billing\n3. Click 'Manage Subscription'\n4. Select 'Cancel Subscription'\n5. Confirm cancellation\n\nYou'll continue to have access until the end of your billing period. No refunds for partial months.",
  },
];

export function loadDemoData() {
  const existing = localStorage.getItem("faq-qa-pairs");
  if (!existing || JSON.parse(existing).length === 0) {
    localStorage.setItem("faq-qa-pairs", JSON.stringify(demoQAPairs));
    return true;
  }
  return false;
}
