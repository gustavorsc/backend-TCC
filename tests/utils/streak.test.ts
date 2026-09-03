import { calcularNovoStreak, streakEmRisco } from "../../src/utils/streak";

// Dias civis são calculados no fuso de São Paulo (UTC−3).

describe("calcularNovoStreak", () => {
  it("começa em 1 quando não há atividade anterior", () => {
    expect(calcularNovoStreak(0, null, new Date("2026-08-30T10:00:00Z"))).toBe(1);
  });

  it("mantém o streak quando a conclusão é no mesmo dia civil local", () => {
    // 30/08 11:00 e 30/08 23:00 UTC = 30/08 08:00 e 30/08 20:00 locais
    const ultimaAtividade = new Date("2026-08-30T11:00:00Z");
    const agora = new Date("2026-08-30T23:00:00Z");

    expect(calcularNovoStreak(3, ultimaAtividade, agora)).toBe(3);
  });

  it("incrementa o streak quando a conclusão é no dia civil local seguinte", () => {
    // 30/08 18:00 UTC = 30/08 15:00 local; 31/08 18:00 UTC = 31/08 15:00 local
    const ultimaAtividade = new Date("2026-08-30T18:00:00Z");
    const agora = new Date("2026-08-31T18:00:00Z");

    expect(calcularNovoStreak(3, ultimaAtividade, agora)).toBe(4);
  });

  it("zera e recomeça em 1 quando passa mais de um dia civil sem conclusão", () => {
    const ultimaAtividade = new Date("2026-08-28T10:00:00Z");
    const agora = new Date("2026-08-31T10:00:00Z");

    expect(calcularNovoStreak(5, ultimaAtividade, agora)).toBe(1);
  });
});

describe("streakEmRisco (RN16)", () => {
  it("é falso quando não há streak ativo", () => {
    expect(streakEmRisco(0, new Date("2026-08-31T10:00:00Z"), new Date("2026-09-01T10:00:00Z"))).toBe(
      false
    );
  });

  it("é falso quando ainda não houve nenhuma atividade", () => {
    expect(streakEmRisco(3, null, new Date("2026-09-01T10:00:00Z"))).toBe(false);
  });

  it("é falso quando já houve conclusão hoje (mesmo dia civil local)", () => {
    const ultimaAtividade = new Date("2026-09-01T12:00:00Z"); // 09:00 local
    const agora = new Date("2026-09-01T23:00:00Z"); // 20:00 local, mesmo dia
    expect(streakEmRisco(3, ultimaAtividade, agora)).toBe(false);
  });

  it("é verdadeiro quando há streak e a última atividade foi num dia anterior", () => {
    const ultimaAtividade = new Date("2026-08-31T12:00:00Z");
    const agora = new Date("2026-09-01T12:00:00Z");
    expect(streakEmRisco(3, ultimaAtividade, agora)).toBe(true);
  });
});
