/**
 * useTourStep
 *
 * Hook que asocia un elementId del tour con una View ref.
 * Cuando el paso activo coincide con el elementId, mide la posición
 * del elemento en pantalla y la registra en TourContext.
 *
 * También mide cuando es el paso SIGUIENTE (upcomingStep) para que
 * la medición esté lista antes de que el usuario presione "Siguiente",
 * eliminando el flash de la tarjeta de espera entre pasos.
 * Excepción: si el paso tiene noPreMeasure=true, se omite la pre-medición
 * (útil cuando el elemento requiere scroll previo para estar en pantalla).
 */

import { useRef, useEffect, RefObject } from 'react';
import { View } from 'react-native';
import { useTour } from '@context/TourContext';

/**
 * Retorna un ref que debe adjuntarse a la View que quieres destacar.
 * Mide cuando: paso activo, waitingElementId, o paso siguiente (pre-medición).
 */
export function useTourStep(elementId: string): RefObject<View> {
  const ref = useRef<View>(null);
  const { currentStep, upcomingStep, registerMeasure, unregisterMeasure, isActive } = useTour();

  useEffect(() => {
    if (!isActive) return;

    const isCurrent =
      currentStep?.elementId === elementId ||
      currentStep?.waitingElementId === elementId;

    const isUpcoming =
      (upcomingStep?.elementId === elementId ||
       upcomingStep?.waitingElementId === elementId) &&
      !upcomingStep?.noPreMeasure;   // respetar flag noPreMeasure

    if (!isCurrent && !isUpcoming) return;

    const t = setTimeout(() => {
      ref.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          registerMeasure(elementId, { x, y, width: w, height: h });
        }
      });
    }, 500); // delay para esperar layout en Android

    return () => clearTimeout(t);
  }, [isActive, currentStep?.elementId, currentStep?.waitingElementId, upcomingStep?.elementId, upcomingStep?.waitingElementId, upcomingStep?.noPreMeasure, elementId, registerMeasure]);

  // Limpiar al desmontar
  useEffect(() => () => unregisterMeasure(elementId), [elementId, unregisterMeasure]);

  return ref;
}

/**
 * Variante que expone también un onLayout, útil cuando el elemento
 * puede no estar montado en el primer render.
 */
export function useTourStepWithLayout(elementId: string): {
  ref: RefObject<View>;
  onLayout: () => void;
} {
  const ref = useRef<View>(null);
  const { currentStep, upcomingStep, registerMeasure, unregisterMeasure, isActive } = useTour();

  const measure = () => {
    if (!isActive) return;

    const isCurrent =
      currentStep?.elementId === elementId ||
      currentStep?.waitingElementId === elementId;

    const isUpcoming =
      (upcomingStep?.elementId === elementId ||
       upcomingStep?.waitingElementId === elementId) &&
      !upcomingStep?.noPreMeasure;

    if (!isCurrent && !isUpcoming) return;

    setTimeout(() => {
      ref.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          registerMeasure(elementId, { x, y, width: w, height: h });
        }
      });
    }, 500);
  };

  useEffect(() => {
    if (!isActive) return;

    const isCurrent =
      currentStep?.elementId === elementId ||
      currentStep?.waitingElementId === elementId;

    const isUpcoming =
      (upcomingStep?.elementId === elementId ||
       upcomingStep?.waitingElementId === elementId) &&
      !upcomingStep?.noPreMeasure;

    if (!isCurrent && !isUpcoming) return;
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentStep?.elementId, currentStep?.waitingElementId, upcomingStep?.elementId, upcomingStep?.waitingElementId, upcomingStep?.noPreMeasure, elementId]);

  useEffect(() => () => unregisterMeasure(elementId), [elementId, unregisterMeasure]);

  return { ref, onLayout: measure };
}
