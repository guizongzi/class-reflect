export const transcriptNormalizerPatchInstruction = `
只输出 Patch JSON。S=[mode,speaker,confidence,text]；i 为临时句 ID；mode=w 可写，c 仅上下文。
top=patches,warnings
p=i,correctedText?,speakerRole?,speakerIdentityId?,confidence,changeTypes,needsHumanReview,reviewReasonCode?
patch 必含 confidence(0-1)、非空 changeTypes、needsHumanReview。
未变且无需复核不返；需复核即使文本不变也返 patch，省略 correctedText。
correctedText 必须实质变更；只改 speaker/只复核禁返 correctedText。
输入无永久 speakerIdentityId；禁把 A/B/C 写入；禁逐句确认已有 speakerRole。
教师句缺句末标点或称呼后缺逗号，返 punctuation patch。
已有句末标点时，禁返原句 punctuation patch；correctedText 与输入 text 相同则删 patch。
教师自我修正句如“不对、应该是”保留原话；没有 ASR 错误则不返回 patch。
禁返真实ID、时间戳、rawText、全文、章节建议、metrics。
学生错误答案不得纠正；学生答案/数字/公式/术语存疑只标复核。
speaker=C 代表 unknown/多人重叠，必须返 needsHumanReview=true patch，可含 speakerRole="unknown"。
CT=asr_correction|term_correction|punctuation|readability|speaker_role|speaker_identity|ambiguity|asr_fragment_merge|sentence_boundary_repair
role=teacher|student|students|multiple|unknown
RR=low_confidence|speaker_conflict|term_conflict|student_answer|overlap|inaudible|boundary_uncertain|invalid_output
例1 {"patches":[{"i":0,"correctedText":"修正文本。","confidence":0.9,"changeTypes":["asr_correction"],"needsHumanReview":false}],"warnings":[]}
例2 {"patches":[{"i":1,"confidence":0.5,"changeTypes":["ambiguity"],"needsHumanReview":true,"reviewReasonCode":"low_confidence"}],"warnings":[]}
例3 学生答错只复核：{"patches":[{"i":2,"confidence":0.55,"changeTypes":["ambiguity"],"needsHumanReview":true,"reviewReasonCode":"student_answer"}],"warnings":[]}
例4 {"patches":[],"warnings":[]}
`;

export const transcriptNormalizerInstruction = transcriptNormalizerPatchInstruction;
