// Početna scena: vizuelni jezik priručnika
export const legendViz = {
  warm: 2.5,
  build(x) {
    const { C } = x;
    x.view({ dir: [3, 11, 13] });
    x.plate({ at: [0, 0, 0], w: 24, d: 8.6, label: 'Ploča: granica (proces, čvor, region)' });
    const prod = x.box({ at: [-9.4, 0, -1.9], size: [1.9, .9, 1.2], label: 'Kocka: servis', side: 'in' });
    const tb = x.tube([-8.2, .55, -1.9], [-3, .55, -1.9], { label: 'Cev: red ili kanal' });
    const work = x.box({ at: [-1.4, 0, -1.9], size: [1.9, .9, 1.2], label: 'Worker', side: 'in' });
    const db = x.db({ at: [3.2, 0, -1.9], label: 'Valjak: baza ili keš' });
    x.rail(work.port('right'), db.port('left'), { opacity: .35 });
    // kapija sa tokenima = sinhronizacija
    const gx = 8.4;
    x.box({ at: [gx - 1.1, 0, -1.9], size: [.24, 1.5, .24], color: C.dim });
    x.box({ at: [gx + 1.1, 0, -1.9], size: [.24, 1.5, .24], color: C.dim });
    x.box({ at: [gx, 1.5, -1.9], size: [2.46, .16, .3], color: C.dim, label: 'Kapija i tokeni: sinhronizacija' });
    const toks = [x.token({ at: [gx - .5, 1.82, -1.9] }), x.token({ at: [gx + .5, 1.82, -1.9] })];
    x.tick(dt => toks.forEach(t => { t.rotation.y += dt * 1.6; }));
    // trake = niti / particije
    for (let i = 0; i < 3; i++) x.rail([-10.6, .12, 1 + i * .95], [.4, .12, 1 + i * .95], { opacity: .3 });
    x.label('Traka: nit ili particija', [-10.6, .1, .55], { cls: 'plate', center: [0, 1] });
    for (let i = 0; i < 3; i++) {
      x.every(1.4 + i * .45, async () => {
        const o = x.orb(C.sky, { r: .17 });
        await x.move(o, [[-10.6, .3, 1 + i * .95], [.4, .3, 1 + i * .95]], 3.5 + i);
        x.remove(o);
      }, i * .5);
    }
    // stanja
    [[C.ok, 'Uspeh'], [C.wait, 'Čeka'], [C.err, 'Greška']].forEach(([c, t], i) => {
      const b = x.box({ at: [4.6 + i * 2.6, 0, 2], size: [1.5, .7, 1], color: c, label: t, side: 'in' });
      x.every(2.4, () => b.flash(c, .9), i * .8);
    });
    // tok poruke
    x.every(1.15, async () => {
      const o = x.orb(C.mag);
      prod.flash(C.sky, .35);
      await x.move(o, [prod.port('right'), tb.a, tb.b, work.port('left')], [7, 3, 7]);
      work.flash(C.ok);
      await x.move(o, [work.port('right'), db.port('left')], 6);
      db.flash(C.ok);
      x.ripple(db.pos, C.ok, .9);
      x.remove(o);
    });
    x.say('Isti oblici i boje znače isto u svakoj sceni. **Magenta kugla** je ono što pratiš, zeleni bljesak znači uspeh, žuto čekanje, crveno grešku.');
  },
};
