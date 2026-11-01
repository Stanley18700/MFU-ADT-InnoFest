/*
 * HANDLER // 0 — what the hooded figure from 2036 says. The story hints, and never says, that
 * the Handler is a future ADT student. Every line restates something a screen already told the
 * visitor (how to scan, what points unlock); none of them introduces a rule of its own.
 * Merged into `en` / `th` in strings.ts, so a key without its Thai twin is a build error.
 */
export const handlerEn = {
  'h.name': 'HANDLER // 0',
  'h.channel': 'SECURE CHANNEL · 2036 → 2026',
  'h.receiving': 'Receiving…',
  'h.tapNext': 'TAP TO RECEIVE',
  'h.skip': 'SKIP',
  'h.replay': 'Replay briefing · ฟังบรีฟอีกครั้ง',

  // The briefing
  'h.b1': 'Agent. Can you read me? This channel is open from 2036.',
  'h.b2': 'I can’t tell you who I am. Only that I once walked this same hall — as an ADT student.',
  'h.b3': 'Every booth here is a senior project. In my time those files were lost, and the future we built on them is fading.',
  'h.b4': 'Find a booth. Tap Scan and point at its QR, or type its 6-character code. Each booth gives up one file.',
  'h.b5': 'Rate each project you recover. Send me one field report and I’ll issue your mission certificate.',
  'h.b6': 'Reach {n} points and the agency unlocks rewards. Show your reward QR at the agency desk.',
  'h.b7': 'This link won’t hold forever. Move fast, agent.',

  // On the screens
  'h.cover.start': 'Your first file is waiting, agent. Start with the target below.',
  'h.cover.go': 'Good work, agent. Every file you send back makes 2036 a little clearer.',
  'h.cover.top': 'Every reward unlocked. 2036 owes you one, agent.',
  'h.files.some': 'Encrypted files are still lost. Tap one to read what I know about it.',
  'h.files.none': 'Nothing recovered yet. The nearest booth is a good place to start.',
  'h.files.all': 'Every file is home. I remember this hall differently now.',
  'h.scan': 'Point at the booth QR. I’ll handle the decryption.',
  'h.res.ok': 'File received in 2036. Something here just changed.',
  'h.res.unlocked': 'That one unlocked a reward. Check the Rewards tab.',
  'h.res.already': 'You recovered this one already. Find me a file I don’t have.',
  'h.res.error': 'The signal broke up. Try that code again.',
  'h.rewards.locked': 'Rewards unlock at {n} points. I’ll be watching.',
  'h.rewards.ready': 'You earned this. Show your QR at the agency desk.',
  'h.survey': 'One field report, agent. Tell me what this future should keep.',
  'h.join': 'Enlist under your real name. It goes on your mission certificate.',
  'h.profile': 'Keep your details straight. It’s how the agency knows you.',
}

export const handlerTh: Record<keyof typeof handlerEn, string> = {
  'h.name': 'HANDLER // 0',
  'h.channel': 'ช่องสัญญาณลับ · 2036 → 2026',
  'h.receiving': 'กำลังรับสัญญาณ…',
  'h.tapNext': 'แตะเพื่อรับข้อความ',
  'h.skip': 'ข้าม',
  'h.replay': 'Replay briefing · ฟังบรีฟอีกครั้ง',

  'h.b1': 'เจ้าหน้าที่ ได้ยินฉันไหม ช่องสัญญาณนี้เปิดมาจากปี 2036',
  'h.b2': 'ฉันบอกไม่ได้ว่าฉันเป็นใคร บอกได้แค่ว่าครั้งหนึ่งฉันเคยเดินอยู่ในโถงนี้ ในฐานะนักศึกษา ADT',
  'h.b3': 'ทุกบูธที่นี่คือโครงงานของนักศึกษาปีสุดท้าย ในยุคของฉัน ไฟล์เหล่านั้นสูญหายไป และอนาคตที่เราสร้างขึ้นจากมันกำลังเลือนหาย',
  'h.b4': 'ตามหาบูธ แตะสแกนแล้วส่องไปที่ QR หรือพิมพ์รหัส 6 ตัวของบูธ แต่ละบูธให้ไฟล์ได้หนึ่งไฟล์',
  'h.b5': 'ให้คะแนนทุกโครงงานที่กู้ได้ ส่งรายงานภาคสนามมาหนึ่งฉบับ แล้วฉันจะออกใบรับรองภารกิจให้',
  'h.b6': 'สะสมให้ครบ {n} คะแนน หน่วยงานจะปลดล็อกรางวัล แสดง QR รางวัลที่โต๊ะหน่วยงาน',
  'h.b7': 'สัญญาณนี้อยู่ได้ไม่นาน รีบลงมือเถอะ เจ้าหน้าที่',

  'h.cover.start': 'ไฟล์แรกรอคุณอยู่ เจ้าหน้าที่ เริ่มจากเป้าหมายด้านล่าง',
  'h.cover.go': 'ทำได้ดี เจ้าหน้าที่ ทุกไฟล์ที่คุณส่งกลับมาทำให้ปี 2036 ชัดเจนขึ้นอีกนิด',
  'h.cover.top': 'ปลดล็อกรางวัลครบแล้ว ปี 2036 ติดหนี้คุณ เจ้าหน้าที่',
  'h.files.some': 'ไฟล์ที่ยังเข้ารหัสยังสูญหายอยู่ แตะเพื่ออ่านสิ่งที่ฉันรู้เกี่ยวกับมัน',
  'h.files.none': 'ยังไม่มีไฟล์ที่กู้ได้ เริ่มจากบูธที่อยู่ใกล้ที่สุด',
  'h.files.all': 'ไฟล์กลับมาครบแล้ว โถงนี้ในความทรงจำของฉันเปลี่ยนไปแล้ว',
  'h.scan': 'ส่องไปที่ QR ของบูธ ที่เหลือฉันถอดรหัสเอง',
  'h.res.ok': 'ไฟล์มาถึงปี 2036 แล้ว บางอย่างที่นี่เพิ่งเปลี่ยนไป',
  'h.res.unlocked': 'ไฟล์นี้ปลดล็อกรางวัลแล้ว ดูที่แท็บรางวัล',
  'h.res.already': 'คุณกู้ไฟล์นี้ไปแล้ว หาไฟล์ที่ฉันยังไม่มีมาให้หน่อย',
  'h.res.error': 'สัญญาณขาดหาย ลองใส่รหัสอีกครั้ง',
  'h.rewards.locked': 'รางวัลจะปลดล็อกเมื่อครบ {n} คะแนน ฉันเฝ้าดูอยู่',
  'h.rewards.ready': 'คุณสมควรได้รับมัน แสดง QR ที่โต๊ะหน่วยงาน',
  'h.survey': 'รายงานภาคสนามหนึ่งฉบับ เจ้าหน้าที่ บอกฉันว่าอนาคตควรเก็บอะไรไว้',
  'h.join': 'ลงทะเบียนด้วยชื่อจริง ชื่อนี้จะอยู่บนใบรับรองภารกิจของคุณ',
  'h.profile': 'ตรวจข้อมูลให้ถูกต้อง หน่วยงานรู้จักคุณจากข้อมูลนี้',
}
