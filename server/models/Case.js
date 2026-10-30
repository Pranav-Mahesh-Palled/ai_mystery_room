import mongoose from 'mongoose';

const { Schema } = mongoose;
const difficultyValues = ['Easy', 'Medium', 'Hard'];
const statusValues = ['active', 'completed'];

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

const suspectSchema = new Schema({
  suspectId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  personality: { type: String, required: true, trim: true },
  motive: { type: String, required: true, trim: true },
  alibi: { type: String, required: true, trim: true },
}, { _id: false });

const clueSchema = new Schema({
  clueId: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  discovered: { type: Boolean, default: false, required: true },
}, { _id: false });

const hintSchema = new Schema({
  hintId: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  unlocked: { type: Boolean, default: false, required: true },
  requestKey: { type: String, default: null, maxlength: 100 },
}, { _id: false });

const solutionSchema = new Schema({
  culpritId: { type: String, required: true, trim: true },
  supportingClueIds: {
    type: [{ type: String, trim: true }],
    required: true,
    validate: {
      validator(ids) {
        return Array.isArray(ids) && ids.length >= 2 && new Set(ids).size === ids.length;
      },
      message: 'At least two unique supporting clue IDs are required.',
    },
  },
  explanation: { type: String, required: true, trim: true },
}, { _id: false });

const accusationSchema = new Schema({
  suspectId: { type: String, required: true, trim: true },
  isCorrect: { type: Boolean, required: true },
  submittedAt: { type: Date, required: true },
}, { _id: false });

const scoreBreakdownSchema = new Schema({
  basePoints: { type: Number, required: true, min: 0 },
  clueBonus: { type: Number, required: true, min: 0 },
  hintPenalty: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
}, { _id: false });

const caseSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  premise: { type: String, required: true, trim: true, minlength: 10, maxlength: 300 },
  story: { type: String, required: true, trim: true, maxlength: 5000 },
  difficulty: { type: String, required: true, enum: difficultyValues },
  status: { type: String, required: true, enum: statusValues, default: 'active' },
  suspects: { type: [suspectSchema], required: true, validate: [nonEmptyArray, 'At least one suspect is required.'] },
  clues: { type: [clueSchema], required: true, validate: [nonEmptyArray, 'At least one clue is required.'] },
  hints: { type: [hintSchema], required: true, validate: [nonEmptyArray, 'At least one hint is required.'] },
  solution: { type: solutionSchema, required: true },
  accusation: { type: accusationSchema, default: null },
  scoreBreakdown: { type: scoreBreakdownSchema, default: null },
}, { timestamps: true, optimisticConcurrency: true });

caseSchema.pre('validate', function initializeSecureState() {
  if (this.isNew) {
    this.status = 'active';
    this.accusation = null;
    this.scoreBreakdown = null;
    this.clues.forEach((clue) => { clue.discovered = false; });
    this.hints.forEach((hint) => { hint.unlocked = false; });
  }

  if (!this.solution || !Array.isArray(this.clues)) return;
  const clueIds = new Set(this.clues.map((clue) => clue.clueId));
  const supportingIds = this.solution.supportingClueIds ?? [];
  if (supportingIds.some((clueId) => !clueIds.has(clueId))) {
    this.invalidate('solution.supportingClueIds', 'Supporting clue IDs must refer to clues in this case.');
  }
  if (!this.suspects.some((suspect) => suspect.suspectId === this.solution.culpritId)) {
    this.invalidate('solution.culpritId', 'The culprit must refer to a suspect in this case.');
  }
});

const Case = mongoose.models.Case || mongoose.model('Case', caseSchema);
export default Case;
