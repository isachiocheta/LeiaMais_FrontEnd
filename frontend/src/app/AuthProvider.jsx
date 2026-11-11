import { createContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { api } from '../services/api.js';
import { createAuthController } from './auth-controller.js';

export const AuthContext = createContext(null);
const authController = createAuthController(api);

export function AuthProvider({ children, controller = authController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.verifySession().catch(() => {});
  }, [controller]);
  const value = useMemo(() => ({
    ...state, login: controller.login, logout: controller.logout, verifySession: controller.verifySession,
    readOwnProfile: controller.readOwnProfile, updateOwnName: controller.updateOwnName,
    changeOwnPassword: controller.changeOwnPassword,
    reauthenticateAfterUncertainPassword: controller.reauthenticateAfterUncertainPassword,
  }), [state, controller]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
