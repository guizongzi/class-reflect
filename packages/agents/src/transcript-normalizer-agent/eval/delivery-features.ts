import type { EvalInputSentence, ExpectedDeliveryFeatures } from "./types";

export function inferEvalDeliveryFeatures(sentence: EvalInputSentence, previous?: EvalInputSentence): ExpectedDeliveryFeatures {
  const text = sentence.text || "";
  const fillerWords = [...text.matchAll(/嗯|呃|额|这个|那个|呢/g)].map((match) => match[0]);
  const repetitions = [...text.matchAll(/([\u4e00-\u9fa5A-Za-z0-9]{1,4})[，,、]?\1/g)];
  return {
    fillerWordCount: fillerWords.length,
    fillerWords,
    repetitionCount: repetitions.length,
    selfCorrectionCount: /不对|不是|应该是|我改一下/.test(text) ? 1 : 0,
    incompleteUtterance: /[，,、]$/.test(text),
    possibleQuestion: /[？?]|为什么|怎么|谁来说|哪|几/.test(text),
    possibleInstruction: /请|先|接下来|开始|观察|回答|打开|完成/.test(text),
    possibleAnswer: sentence.speakerRoleHint === "student" || sentence.speakerRoleHint === "students" || /^(懂了|会了|对|不是|我|答案|CO\d)/.test(text.replace(/\s+/g, "")),
    possibleFeedback: /很好|不错|对了|再想想/.test(text),
    speakerTurnChanged: previous ? (previous.rawSpeakerId || previous.speakerLabel || "") !== (sentence.rawSpeakerId || sentence.speakerLabel || "") : false
  };
}
