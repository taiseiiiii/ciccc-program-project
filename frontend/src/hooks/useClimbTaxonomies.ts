import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type Grade from "../types/GradeType";
import type TaxonomyTerm from "../types/TaxonomyType";
import type WeaknessType from "../types/WeaknessType";

/**
 * The four vocabularies every climb form needs: grades, wall types, hold types
 * and weaknesses.
 *
 * Pulled out of LogSession when a second screen — editing a saved climb — began
 * needing exactly the same four. Sharing the hook means sharing the query keys
 * too, so the second screen reads from the cache the first one filled rather
 * than fetching the V-scale again.
 *
 * Grades also come back as a pair of lookups. The form works in grade names,
 * because that is what a climber picks and what a draft stores, while the API
 * speaks grade ids; the two directions of that translation are needed by every
 * caller, and getting one backwards silently logs the wrong grade.
 */
export interface ClimbTaxonomies {
  grades: Grade[];
  wallTypes: TaxonomyTerm[];
  holdTypes: TaxonomyTerm[];
  weaknesses: WeaknessType[];

  isGradesLoading: boolean;
  isGradesError: boolean;
  refetchGrades: () => void;
  isWallTypesLoading: boolean;
  isHoldTypesLoading: boolean;
  isWeaknessesLoading: boolean;

  /** Name to id, for sending a climb to the API. Undefined if unknown. */
  gradeIdByName: (name: string) => number | undefined;
  /** Id to name, for seeding the form from a saved climb. */
  gradeNameById: (id: number) => string | undefined;
}

export function useClimbTaxonomies(): ClimbTaxonomies {
  // Grades and the two tag vocabularies are fixed lists that change only when a
  // migration changes them — fetched once and never refetched.
  const masterQuery = { staleTime: Infinity } as const;

  const {
    data: gradesData,
    isPending: isGradesLoading,
    isError: isGradesError,
    refetch: refetchGrades,
  } = useQuery({
    queryKey: ["grades"],
    queryFn: () => api<{ data: Grade[] }>("/grades"),
    ...masterQuery,
  });

  const { data: wallTypesData, isPending: isWallTypesLoading } = useQuery({
    queryKey: ["wall-types"],
    queryFn: () => api<{ data: TaxonomyTerm[] }>("/wall-types"),
    ...masterQuery,
  });

  const { data: holdTypesData, isPending: isHoldTypesLoading } = useQuery({
    queryKey: ["hold-types"],
    queryFn: () => api<{ data: TaxonomyTerm[] }>("/hold-types"),
    ...masterQuery,
  });

  // Not master data: this list grows every time the climber types a new label.
  const { data: weaknessesData, isPending: isWeaknessesLoading } = useQuery({
    queryKey: ["weaknesses"],
    queryFn: () => api<{ data: WeaknessType[] }>("/weaknesses"),
  });

  const grades = gradesData?.data ?? [];

  return {
    grades,
    wallTypes: wallTypesData?.data ?? [],
    holdTypes: holdTypesData?.data ?? [],
    weaknesses: weaknessesData?.data ?? [],

    isGradesLoading,
    isGradesError,
    refetchGrades: () => void refetchGrades(),
    isWallTypesLoading,
    isHoldTypesLoading,
    isWeaknessesLoading,

    gradeIdByName: (name) =>
      grades.find((g) => g.grade_name === name)?.grade_id,
    gradeNameById: (id) => grades.find((g) => g.grade_id === id)?.grade_name,
  };
}
