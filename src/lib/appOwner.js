/**
 * App Owner Configuration
 * The platform owner of this application.
 */

export const APP_OWNER = {
  full_name: 'markjosip',
  email: 'markjosip@outlook.com',
  role: 'platform_super_admin',
  user_id: '6a0b825bb12d2a5b5b10235b',
};

/**
 * Check if a given user is the platform owner.
 * @param {object} user - User object from auth context
 * @returns {boolean}
 */
export const isAppOwner = (user) => {
  return user?.email === APP_OWNER.email || user?.id === APP_OWNER.user_id;
};