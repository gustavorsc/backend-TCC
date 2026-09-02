import { calcularNovoStreak } from "../../src/utils/streak";

describe("calcularNovoStreak", () => {
  it("começa em 1 quando não há atividade anterior", () => {
    expect(calcularNovoStreak(0, null, new Date("2026-08-30T10:00:00Z"))).toBe(1);
  });

  it("mantém o streak quando a conclusão é no mesmo dia civil", () => {
    const ultimaAtividade = new Date("2026-08-30T08:00:00Z");
    const agora = new Date("2026-08-30T20:00:00Z");

    expect(calcularNovoStreak(3, ultimaAtividade, agora)).toBe(3);
  });

  it("incrementa o streak quando a conclusão é no dia civil seguinte", () => {
    const ultimaAtividade = new Date("2026-08-30T23:00:00Z");
    const agora = new Date("2026-08-31T01:00:00Z");

    expect(calcularNovoStreak(3, ultimaAtividade, agora)).toBe(4);
  });

  it("zera e recomeça em 1 quando passa mais de um dia civil sem conclusão", () => {
    const ultimaAtividade = new Date("2026-08-28T10:00:00Z");
    const agora = new Date("2026-08-31T10:00:00Z");

    expect(calcularNovoStreak(5, ultimaAtividade, agora)).toBe(1);
  });
});
