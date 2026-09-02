import { limitesDaSemanaAtual } from "../../src/utils/semana";

describe("limitesDaSemanaAtual", () => {
  it("calcula segunda a domingo quando 'agora' cai no meio da semana (quarta)", () => {
    const agora = new Date("2026-09-02T12:00:00Z"); // quarta-feira
    const { inicio, fim } = limitesDaSemanaAtual(agora);

    expect(inicio.toISOString()).toBe("2026-08-31T00:00:00.000Z"); // segunda
    expect(fim.toISOString()).toBe("2026-09-06T23:59:59.999Z"); // domingo
  });

  it("trata domingo como o último dia da semana corrente, não o primeiro", () => {
    const agora = new Date("2026-09-06T10:00:00Z"); // domingo
    const { inicio, fim } = limitesDaSemanaAtual(agora);

    expect(inicio.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-09-06T23:59:59.999Z");
  });

  it("segunda-feira é o início da própria semana", () => {
    const agora = new Date("2026-08-31T00:00:01Z"); // segunda, logo após meia-noite
    const { inicio } = limitesDaSemanaAtual(agora);

    expect(inicio.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });
});
