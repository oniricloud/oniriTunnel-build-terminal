export const API = {
  // Test and core service commands
  TESTCOMMAND: 1,
  START_ONIRI_SERVICE: 2,
  STOP_ONIRI_SERVICE: 3,
  GET_ONIRI_SERVICE_STATUS: 4,
  SEND_NOTIFICATION: 5,

  // Daemon control commands
  RESTART_ONIRI_SERVICE: 6,
  GET_STATUS: 7,

  // Configuration commands
  CONFIGURE: 8,
  RESET_CONFIG: 9,

  // Logs commands
  GET_LOGS: 10,

  // Settings commands
  SET_AUTO_LAUNCH: 11,
  SET_AUTO_START_DAEMON: 12,

  // Services commands
  GET_ALL_SERVICES: 13,
  GET_ALLOWED_LIST: 14,
}


export const API_BY_VALUE = Object.entries(API).reduce((acc, [key, value]) => {
  acc[value] = key
  return acc
}, {})


export default { API, API_BY_VALUE }