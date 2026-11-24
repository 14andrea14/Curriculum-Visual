// Estado compartido: la carta sola (BootTransition) debe tocarse para poder seguir bajando.
// Lo lee el motor de scroll asistido (holdDown de la parada exp-card) y lo cambia BootTransition.
export const cardGate = { open: false };
