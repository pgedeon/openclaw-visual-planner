/*
 * OpenClaw Visual Planner
 * planner-api.js
 *
 * The frontend API client probes backend availability, wraps JSON requests, and
 * keeps the planner's local/server persistence wiring centralized.
 */

(() => {
  const Planner = window.OpenClawPlanner = window.OpenClawPlanner || {};

  const LAST_SERVER_PLAN_KEY = 'openclaw.visualPlanner.lastServerPlanId';

  const buildErrorMessage = async (response) => {
    try {
      const payload = await response.json();
      return payload?.error || `${response.status} ${response.statusText}`.trim();
    } catch (error) {
      return `${response.status} ${response.statusText}`.trim();
    }
  };

  function createPlannerApiClient(options = {}) {
    const baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
    let backendAvailable = null;
    let lastCheckedAt = 0;

    const buildUrl = (pathname) => `${baseUrl}${pathname}`;

    const requestJson = async (pathname, requestOptions = {}) => {
      const response = await fetch(buildUrl(pathname), {
        headers: {
          'Content-Type': 'application/json',
          ...(requestOptions.headers || {}),
        },
        ...requestOptions,
      });

      if (!response.ok) {
        throw new Error(await buildErrorMessage(response));
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    };

    const withAvailability = async (callback) => {
      const payload = await callback();
      backendAvailable = true;
      lastCheckedAt = Date.now();
      return payload;
    };

    return {
      async probeBackend({ force = false } = {}) {
        if (!force && backendAvailable !== null && Date.now() - lastCheckedAt < 15000) {
          return backendAvailable;
        }

        try {
          const payload = await requestJson('/api/health');
          backendAvailable = payload?.ok === true;
        } catch (error) {
          backendAvailable = false;
        }

        lastCheckedAt = Date.now();
        return backendAvailable;
      },
      getBackendAvailability() {
        return backendAvailable;
      },
      async listPlans() {
        const payload = await withAvailability(() => requestJson('/api/plans'));
        return payload?.plans || [];
      },
      async createPlan(body) {
        const payload = await withAvailability(() => requestJson('/api/plans', {
          method: 'POST',
          body: JSON.stringify(body || {}),
        }));
        return payload;
      },
      async getPlan(planId) {
        const payload = await withAvailability(() => requestJson(`/api/plans/${encodeURIComponent(planId)}`));
        return payload;
      },
      async updatePlan(planId, body) {
        const payload = await withAvailability(() => requestJson(`/api/plans/${encodeURIComponent(planId)}`, {
          method: 'PUT',
          body: JSON.stringify(body || {}),
        }));
        return payload;
      },
      async validatePlan(planId, body = {}) {
        const payload = await withAvailability(() => requestJson(`/api/plans/${encodeURIComponent(planId)}/validate`, {
          method: 'POST',
          body: JSON.stringify(body),
        }));
        return payload;
      },
      async listVersions(planId) {
        const payload = await withAvailability(() => requestJson(`/api/plans/${encodeURIComponent(planId)}/versions`));
        return payload?.versions || [];
      },
      async createVersion(planId, body = {}) {
        const payload = await withAvailability(() => requestJson(`/api/plans/${encodeURIComponent(planId)}/versions`, {
          method: 'POST',
          body: JSON.stringify(body),
        }));
        return payload;
      },
      async listTemplates() {
        const payload = await withAvailability(() => requestJson('/api/templates'));
        return payload?.templates || [];
      },
      async createTemplate(body = {}) {
        const payload = await withAvailability(() => requestJson('/api/templates', {
          method: 'POST',
          body: JSON.stringify(body),
        }));
        return payload;
      },
    };
  }

  const setLastServerPlanId = (planId) => {
    if (!planId) {
      localStorage.removeItem(LAST_SERVER_PLAN_KEY);
      return;
    }

    localStorage.setItem(LAST_SERVER_PLAN_KEY, String(planId));
  };

  const getLastServerPlanId = () => localStorage.getItem(LAST_SERVER_PLAN_KEY) || '';
  const clearLastServerPlanId = () => localStorage.removeItem(LAST_SERVER_PLAN_KEY);

  Planner.PLANNER_LAST_SERVER_PLAN_KEY = LAST_SERVER_PLAN_KEY;
  Planner.createPlannerApiClient = createPlannerApiClient;
  Planner.setPlannerLastServerPlanId = setLastServerPlanId;
  Planner.getPlannerLastServerPlanId = getLastServerPlanId;
  Planner.clearPlannerLastServerPlanId = clearLastServerPlanId;
})();
