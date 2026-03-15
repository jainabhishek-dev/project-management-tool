export const ADMIN_EMAILS = [
  'abhishek.jain@leadschool.in',
  'disha.jain@leadschool.in',
  'visalam.narayanan@leadschool.in'
];

export const isAdmin = (email) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};
