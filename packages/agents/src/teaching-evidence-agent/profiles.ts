import type { EvidenceCategory, LessonFormat } from "@class-reflect/shared-types";

export type EvidenceProfile = {
  priorityCategories: EvidenceCategory[];
  disabledCategories: EvidenceCategory[];
  positiveCategories: EvidenceCategory[];
  negativeCategories: EvidenceCategory[];
  maxPositiveCards: number;
  maxNegativeCards: number;
};

export const deterministicRuleEvidenceCategories: EvidenceCategory[] = [
  "wait_time",
  "student_response",
  "response_pattern",
  "classroom_management",
  "technical_issue",
  "self_check"
];

export function semanticEvidenceCategoriesForLlm(categories: EvidenceCategory[]) {
  const deterministic = new Set(deterministicRuleEvidenceCategories);
  return categories.filter((category) => !deterministic.has(category));
}

export const evidenceProfileByLessonFormat = {
  offline_classroom_recording: {
    priorityCategories: [
      "question_quality",
      "wait_time",
      "learning_check_level",
      "student_response",
      "feedback_quality",
      "follow_up",
      "lesson_structure",
      "explanation_quality",
      "misconception_handling",
      "cognitive_scaffolding",
      "example_quality"
    ],
    disabledCategories: ["technical_issue", "self_check"],
    positiveCategories: [
      "question_quality",
      "feedback_quality",
      "follow_up",
      "lesson_structure",
      "explanation_quality",
      "misconception_handling",
      "cognitive_scaffolding",
      "example_quality"
    ],
    negativeCategories: [
      "question_quality",
      "wait_time",
      "learning_check_level",
      "student_response",
      "feedback_quality",
      "follow_up",
      "lesson_structure",
      "classroom_management",
      "explanation_quality",
      "misconception_handling",
      "cognitive_scaffolding",
      "example_quality"
    ],
    maxPositiveCards: 3,
    maxNegativeCards: 3
  },
  live_online_class: {
    priorityCategories: [
      "question_quality",
      "student_response",
      "wait_time",
      "technical_issue",
      "learning_check_level",
      "follow_up",
      "classroom_management",
      "information_density",
      "explanation_quality",
      "misconception_handling",
      "cognitive_scaffolding",
      "example_quality"
    ],
    disabledCategories: ["self_check"],
    positiveCategories: [
      "question_quality",
      "student_response",
      "feedback_quality",
      "follow_up",
      "lesson_structure",
      "learning_check_level",
      "explanation_quality",
      "misconception_handling",
      "cognitive_scaffolding",
      "example_quality"
    ],
    negativeCategories: [
      "question_quality",
      "wait_time",
      "feedback_quality",
      "follow_up",
      "technical_issue",
      "classroom_management",
      "information_density",
      "explanation_quality",
      "misconception_handling",
      "cognitive_scaffolding",
      "example_quality"
    ],
    maxPositiveCards: 3,
    maxNegativeCards: 3
  },
  recorded_online_class: {
    priorityCategories: [
      "lesson_structure",
      "information_density",
      "self_check",
      "question_quality",
      "method_generalization",
      "knowledge_connection",
      "structured_review",
      "explanation_quality",
      "cognitive_scaffolding",
      "example_quality"
    ],
    disabledCategories: [
      "wait_time",
      "student_response",
      "feedback_quality",
      "response_pattern",
      "classroom_management",
      "follow_up",
      "misconception_handling"
    ],
    positiveCategories: [
      "lesson_structure",
      "self_check",
      "question_quality",
      "method_generalization",
      "knowledge_connection",
      "structured_review",
      "explanation_quality",
      "cognitive_scaffolding",
      "example_quality"
    ],
    negativeCategories: [
      "question_quality",
      "lesson_structure",
      "information_density",
      "method_generalization",
      "knowledge_connection",
      "structured_review",
      "explanation_quality",
      "cognitive_scaffolding",
      "example_quality"
    ],
    maxPositiveCards: 3,
    maxNegativeCards: 3
  },
  teacher_certification_interview: {
    priorityCategories: [
      "teaching_objective_alignment",
      "lesson_structure",
      "question_quality",
      "simulated_interaction_quality",
      "feedback_quality",
      "learning_check_level",
      "explanation_quality",
      "teaching_highlight",
      "cognitive_scaffolding",
      "teacher_language",
      "closure_quality",
      "example_quality",
      "teaching_evaluation",
      "knowledge_accuracy"
    ],
    disabledCategories: [
      "wait_time",
      "student_response",
      "response_pattern",
      "technical_issue",
      "classroom_management"
    ],
    positiveCategories: [
      "teaching_objective_alignment",
      "lesson_structure",
      "question_quality",
      "simulated_interaction_quality",
      "feedback_quality",
      "learning_check_level",
      "explanation_quality",
      "teaching_highlight",
      "cognitive_scaffolding",
      "teacher_language",
      "closure_quality",
      "example_quality",
      "teaching_evaluation",
      "knowledge_accuracy"
    ],
    negativeCategories: [
      "teaching_objective_alignment",
      "lesson_structure",
      "question_quality",
      "simulated_interaction_quality",
      "feedback_quality",
      "learning_check_level",
      "explanation_quality",
      "teaching_highlight",
      "cognitive_scaffolding",
      "teacher_language",
      "closure_quality",
      "example_quality",
      "teaching_evaluation",
      "knowledge_accuracy"
    ],
    maxPositiveCards: 3,
    maxNegativeCards: 3
  },
  teacher_qualification_demo: {
    priorityCategories: [
      "teaching_objective_alignment",
      "lesson_structure",
      "question_quality",
      "simulated_interaction_quality",
      "feedback_quality",
      "learning_check_level",
      "explanation_quality",
      "teaching_highlight",
      "cognitive_scaffolding",
      "teacher_language",
      "closure_quality",
      "example_quality",
      "teaching_evaluation",
      "knowledge_accuracy"
    ],
    disabledCategories: [
      "wait_time",
      "student_response",
      "response_pattern",
      "technical_issue",
      "classroom_management"
    ],
    positiveCategories: [
      "teaching_objective_alignment",
      "lesson_structure",
      "question_quality",
      "simulated_interaction_quality",
      "feedback_quality",
      "learning_check_level",
      "explanation_quality",
      "teaching_highlight",
      "cognitive_scaffolding",
      "teacher_language",
      "closure_quality",
      "example_quality",
      "teaching_evaluation",
      "knowledge_accuracy"
    ],
    negativeCategories: [
      "teaching_objective_alignment",
      "lesson_structure",
      "question_quality",
      "simulated_interaction_quality",
      "feedback_quality",
      "learning_check_level",
      "explanation_quality",
      "teaching_highlight",
      "cognitive_scaffolding",
      "teacher_language",
      "closure_quality",
      "example_quality",
      "teaching_evaluation",
      "knowledge_accuracy"
    ],
    maxPositiveCards: 3,
    maxNegativeCards: 3
  }
} satisfies Record<LessonFormat, EvidenceProfile>;

export function defaultCategoriesForLessonFormat(lessonFormat: LessonFormat): EvidenceCategory[] {
  return evidenceProfileByLessonFormat[lessonFormat].priorityCategories;
}
