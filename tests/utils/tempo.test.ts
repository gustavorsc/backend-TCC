import { diaCivil, diferencaEmDiasCivis, limitesDaSemanaAtual } from "../../src/utils/tempo";

describe("diaCivil (fuso America/Sao_Paulo, UTC−3)", () => {
  it("usa o dia local, não o UTC, perto da meia-noite", () => {
    // 03/09 01:00 UTC = 02/09 22:00 em São Paulo
    expect(diaCivil(new Date("2026-09-03T01:00:00Z"))).toBe("2026-09-02");
    // 03/09 12:00 UTC = 03/09 09:00 em São Paulo
    expect(diaCivil(new Date("2026-09-03T12:00:00Z"))).toBe("2026-09-03");
  });
});

describe("diferencaEmDiasCivis (fuso America/Sao_Paulo)", () => {
  it("conta 0 quando os dois instantes caem no mesmo dia local", () => {
    // 30/08 20:00 e 31/08 01:00 UTC = 30/08 17:00 e 30/08 22:00 locais
    const a = new Date("2026-08-30T20:00:00Z");
    const b = new Date("2026-08-31T01:00:00Z");
    expect(diferencaEmDiasCivis(a, b)).toBe(0);
  });

  it("conta 1 quando cruza uma meia-noite local", () => {
    // 30/08 23:00 e 01/09 01:00 UTC = 30/08 20:00 e 31/08 22:00 locais
    const a = new Date("2026-08-30T23:00:00Z");
    const b = new Date("2026-09-01T01:00:00Z");
    expect(diferencaEmDiasCivis(a, b)).toBe(1);
  });

  it("é negativo quando 'para' vem antes de 'de'", () => {
    expect(
      diferencaEmDiasCivis(new Date("2026-09-05T12:00:00Z"), new Date("2026-09-03T12:00:00Z"))
    ).toBe(-2);
  });
});

describe("limitesDaSemanaAtual (seg–dom no fuso de São Paulo)", () => {
  it("quarta no meio da semana → segunda a domingo locais, em instantes UTC", () => {
    const agora = new Date("2026-09-02T12:00:00Z"); // quarta 09:00 local
    const { inicio, fim } = limitesDaSemanaAtual(agora);

    expect(inicio.toISOString()).toBe("2026-08-31T03:00:00.000Z"); // seg 00:00 local
    expect(fim.toISOString()).toBe("2026-09-07T02:59:59.999Z"); // dom 23:59:59.999 local
  });

  it("domingo à noite local ainda pertence à semana que termina naquele domingo", () => {
    // 07/09 01:00 UTC = 06/09 22:00 local (domingo)
    const agora = new Date("2026-09-07T01:00:00Z");
    const { inicio, fim } = limitesDaSemanaAtual(agora);

    expect(inicio.toISOString()).toBe("2026-08-31T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-09-07T02:59:59.999Z");
  });

  it("segunda logo após a meia-noite local é o início da própria semana", () => {
    // 31/08 03:30 UTC = 31/08 00:30 local (segunda)
    const agora = new Date("2026-08-31T03:30:00Z");
    const { inicio } = limitesDaSemanaAtual(agora);

    expect(inicio.toISOString()).toBe("2026-08-31T03:00:00.000Z");
  });
});
