import { z } from "zod";

// FM-VAA-052 Host Training Establishment (HTE) Evaluation Form, Revision 00, effective
// 7 Aug 2024 (Office of the VPAA). Wording is VPAA's, item for item; client-safe so the
// form, the service and the PDF share one copy.
export const FORM = { code: "FM-VAA-052", revision: "00", effectivity: "7 Aug 2024" } as const;

export const OBLIGATIONS = [
  "Designs the internship plan in partnership with the HEI",
  "Encourages student interns to develop their personality and professionalism, and to the extent possible, protect them from physical or moral danger",
  "Assigns a point/focal person responsible for the implementation of all phases of the internship",
  "Orients the student intern on the standard rules and regulations of their establishment before signing of contract",
  "Enters into an internship contract agreement with the student intern",
  "Facilitates the processing of the documents",
  "Provides practical training or work experience in accordance with agreed internship plan and schedule of activities",
  "Provides necessary incentives to the student interns as contained in the MOA",
  "Ensures that student interns do not perform tasks and duties of regular position in the HTEs",
  "Provides supervised applied learning experience for student interns in accordance with agreed internship plan and schedule of activities",
  "Develops feedback mechanism to the student intern",
  "Develops feedback mechanism to HEI for the overall implementation of the internship and student performance",
  "Provides monitoring and evaluation reports or other information on the student intern’s performance as maybe required by the HEI",
  "Makes available, accurate, and current records and provides access to HEI of such records while on internship",
  "Notifies and provides at least 30 working days written notice of a student intern’s breach of contract or misconduct in the internship premises prior to THE’s decision to suspend and terminate the contract",
  "Issues certificates of completion for the student interns not later than two weeks after the completion of internship",
] as const;

export const QUALITY = [
  "Quality of supervision received from the HTE assigned supervisor (availability of supervisor, guidance and feedback provided, and knowledge and expertise of supervisor)",
  "Quality of training received (Job-Specific Skills, Soft Skills, and Professional Development)",
  "Quality and organization of the training structure",
  "Extent of attainment of the training objectives",
  "Provision of Opportunities for the application of knowledge and skills",
  "Provision of learning new and trend skills needed by the workplace",
] as const;

// Highest first, as the form's columns run.
export const IMPLEMENTATION_LEVELS = [
  {
    value: 4,
    label: "Advanced Level of Implementation",
    description:
      "The item is fully integrated and consistently executed in the internship program by the HTE. The implementation goes beyond basic requirements and includes innovative practices, enhancements, and continuous improvement efforts.",
  },
  {
    value: 3,
    label: "High Level of Implementation",
    description:
      "The item is generally implemented in the internship program with most components fully operational and effective. The implementation of the item meets all essential requirements and show commitment to meeting high standards.",
  },
  {
    value: 2,
    label: "Medium Level of Implementation",
    description:
      "The item is partially implemented in the internship program. Some key components are in place and functioning, but there are inconsistencies or gaps in the execution.",
  },
  {
    value: 1,
    label: "Low Level of Implementation",
    description:
      "The item is minimally implemented in the internship program. Key components of the item are missing, incomplete, or nominally addressed. There is little evidence of a coherent or systematic approach to the implementation of the item.",
  },
] as const;

export const QUALITY_LEVELS = [
  { value: 4, label: "Highly Satisfactory" },
  { value: 3, label: "Satisfactory" },
  { value: 2, label: "Fairly Satisfactory" },
  { value: 1, label: "Not Satisfactory" },
] as const;

export const COMMENT_QUESTIONS = {
  liked:
    "What did you like most about the internship program with the Host Training Establishment?",
  improve: "What aspects of the internship could be improved by the Host Training Establishment?",
  comment: "Any other comments or suggestions?",
} as const;

const level = z.number().int().min(1).max(4);
const comment = z
  .string()
  .trim()
  .max(1000, "Keep each comment under 1,000 characters")
  .optional()
  .transform((c) => c || null);

export const hteEvaluationSchema = z.object({
  obligations: z.array(level).length(OBLIGATIONS.length, "Rate all 16 obligations"),
  quality: z.array(level).length(QUALITY.length, "Rate all 6 internship-quality items"),
  liked: comment,
  improve: comment,
  comment,
});
