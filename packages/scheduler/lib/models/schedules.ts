import type { JsonValue } from 'type-fest';
import { uuidv7 } from 'uuidv7';
import type knex from 'knex';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { Schedule, ScheduleState } from '../types';

export const SCHEDULES_TABLE = 'schedules';

interface ScheduleStateTransition {
    from: ScheduleState;
    to: ScheduleState;
}

export const validScheduleStateTransitions = [
    { from: 'STARTED', to: 'PAUSED' },
    { from: 'STARTED', to: 'DELETED' },
    { from: 'PAUSED', to: 'STARTED' }
] as const;
export type ValidScheduleStateTransitions = (typeof validScheduleStateTransitions)[number];

const ScheduleStateTransition = {
    validate({ from, to }: { from: ScheduleState; to: ScheduleState }): Result<ValidScheduleStateTransitions> {
        const transition = validScheduleStateTransitions.find((t) => t.from === from && t.to === to);
        if (transition) {
            return Ok(transition);
        } else {
            return Err(new Error(`Invalid state transition from ${from} to ${to}`));
        }
    }
};

interface DbSchedule {
    readonly id: string;
    readonly name: string;
    state: ScheduleState;
    readonly starts_at: Date;
    frequency: string;
    payload: JsonValue;
    readonly created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
}

// knex uses https://github.com/bendrucker/postgres-interval
function postgresIntervalInMs(i: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
}): number {
    return (
        (i.years ?? 0) * 31536000000 +
        (i.months ?? 0) * 2592000000 +
        (i.days ?? 0) * 86400000 +
        (i.hours ?? 0) * 3600000 +
        (i.minutes ?? 0) * 60000 +
        (i.seconds ?? 0) * 1000 +
        (i.milliseconds ?? 0)
    );
}

const DbSchedule = {
    to: (schedule: Schedule): DbSchedule => ({
        id: schedule.id.toString(),
        name: schedule.name,
        state: schedule.state,
        starts_at: schedule.startsAt,
        frequency: `${schedule.frequencyMs} milliseconds`,
        payload: schedule.payload,
        created_at: schedule.createdAt,
        updated_at: schedule.updatedAt,
        deleted_at: schedule.deletedAt
    }),
    from: (dbSchedule: DbSchedule): Schedule => ({
        id: dbSchedule.id,
        name: dbSchedule.name,
        state: dbSchedule.state,
        startsAt: dbSchedule.starts_at,
        frequencyMs: postgresIntervalInMs(dbSchedule.frequency as any),
        payload: dbSchedule.payload,
        createdAt: dbSchedule.created_at,
        updatedAt: dbSchedule.updated_at,
        deletedAt: dbSchedule.deleted_at
    })
};

export type ScheduleProps = Omit<Schedule, 'id' | 'state' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export async function create(db: knex.Knex, props: ScheduleProps): Promise<Result<Schedule>> {
    const now = new Date();
    const newSchedule: Schedule = {
        ...props,
        id: uuidv7(),
        state: 'STARTED',
        payload: props.payload,
        startsAt: now,
        frequencyMs: props.frequencyMs,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
    };
    try {
        const inserted = await db.from<DbSchedule>(SCHEDULES_TABLE).insert(DbSchedule.to(newSchedule)).returning('*');
        if (!inserted?.[0]) {
            return Err(new Error(`Error: no schedule '${props.name}' created`));
        }
        return Ok(DbSchedule.from(inserted[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error creating schedule '${props.name}': ${stringifyError(err)}`));
    }
}

export async function get(db: knex.Knex, scheduleId: string): Promise<Result<Schedule>> {
    try {
        const schedule = await db.from<DbSchedule>(SCHEDULES_TABLE).where('id', scheduleId).first();
        if (!schedule) {
            return Err(new Error(`Error: no schedule '${scheduleId}' found`));
        }
        return Ok(DbSchedule.from(schedule));
    } catch (err: unknown) {
        return Err(new Error(`Error getting schedule '${scheduleId}': ${stringifyError(err)}`));
    }
}

export async function transitionState(db: knex.Knex, scheduleId: string, to: ScheduleState): Promise<Result<Schedule>> {
    try {
        const getSchedule = await get(db, scheduleId);
        if (getSchedule.isErr()) {
            return Err(new Error(`Error: no schedule '${scheduleId}' found`));
        }
        const transition = ScheduleStateTransition.validate({ from: getSchedule.value.state, to });
        if (transition.isErr()) {
            return Err(transition.error);
        }
        const updated = await db.from<DbSchedule>(SCHEDULES_TABLE).where('id', scheduleId).update({ state: to, updated_at: new Date() }).returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Error: no schedule '${scheduleId}' updated`));
        }
        return Ok(DbSchedule.from(updated[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error transitioning schedule '${scheduleId}': ${stringifyError(err)}`));
    }
}

export async function update(db: knex.Knex, props: Partial<Pick<ScheduleProps, 'frequencyMs' | 'payload'>> & { id: string }): Promise<Result<Schedule>> {
    try {
        const newValues = {
            ...(props.frequencyMs ? { frequency: `${props.frequencyMs} milliseconds` } : {}),
            ...(props.payload ? { payload: props.payload } : {}),
            updated_at: new Date()
        };
        const updated = await db.from<DbSchedule>(SCHEDULES_TABLE).where('id', props.id).update(newValues).returning('*');
        if (!updated?.[0]) {
            return Err(new Error(`Error: no schedule '${props.id}' updated`));
        }
        return Ok(DbSchedule.from(updated[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error updating schedule '${props.id}': ${stringifyError(err)}`));
    }
}

export async function remove(db: knex.Knex, id: string): Promise<Result<Schedule>> {
    try {
        const now = new Date();
        const deleted = await db
            .from<DbSchedule>(SCHEDULES_TABLE)
            .where('id', id)
            .update({ state: 'DELETED', deleted_at: now, updated_at: now })
            .returning('*');
        if (!deleted?.[0]) {
            return Err(new Error(`Error: no schedule '${id}' deleted`));
        }
        return Ok(DbSchedule.from(deleted[0]));
    } catch (err: unknown) {
        return Err(new Error(`Error deleting schedule '${id}': ${stringifyError(err)}`));
    }
}

export async function search(db: knex.Knex, params: { name?: string; state?: ScheduleState; limit: number }): Promise<Result<Schedule[]>> {
    try {
        const query = db.from<DbSchedule>(SCHEDULES_TABLE).limit(params.limit);
        if (params.name) {
            query.where('name', params.name);
        }
        if (params.state) {
            query.where('state', params.state);
        }
        const schedules = await query;
        return Ok(schedules.map(DbSchedule.from));
    } catch (err: unknown) {
        return Err(new Error(`Error searching schedules: ${stringifyError(err)}`));
    }
}