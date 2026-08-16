import { Request, Response, NextFunction } from "express";
import {
    createResource, getResourceById, listMyResources,
    listNearbyResources, updateResource, deleteResourceById,
} from "../services/resource.service";
import type { ApiResponse } from "../utils/responseApi";

export const createResourceHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const resource = await createResource(req.user!.uid, req.body);
        const response: ApiResponse<typeof resource> = { success: true, data: resource };
        res.status(201).json(response);
    } catch (error) { next(error); }
};

export const listMyResourcesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await listMyResources(req.user!.uid, req.query);
        const response: ApiResponse<typeof result> = { success: true, data: result };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const listNearbyResourcesHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radiusKm = Number(req.query.radiusKm);

        const result = await listNearbyResources(lat, lng, radiusKm, req.query);
        const response: ApiResponse<typeof result> = { success: true, data: result };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const getResourceHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const resource = await getResourceById(req.params.id as string);
        const response: ApiResponse<typeof resource> = { success: true, data: resource };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const updateResourceHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const resource = await updateResource(req.params.id as string, req.user!.uid, req.body);
        const response: ApiResponse<typeof resource> = { success: true, data: resource };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const deleteResourceHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await deleteResourceById(req.params.id as string, req.user!.uid);
        const response: ApiResponse<null> = { success: true, data: null };
        res.status(200).json(response);
    } catch (error) { next(error); }
};