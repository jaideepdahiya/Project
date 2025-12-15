import { asyncHandler } from "../utils/asyncHandler.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {apiError} from "../utils/apiError.js";
import {apiResponse} from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    const {fullName, email, username, password} = req.body;
    if([fullName, email, username, password].some((field)=>field?.trim()==="")){
        throw new apiError(400, "All fields are required")
    }
    // TODO: put some more validation on the input
    const existedUser = User.findOne({ $or: [{email}, {username}]});
    if(existedUser){
        throw new apiError(409, "username already in use")
    }
    // Check more about req.files
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path;
    if(!avatarLocalPath){
        throw new apiError(400, "Avatar image is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new apiError(500, "Uploading failed to cloudinary");
    }

    const user = await User.create({
        fullName,
        email,
        username: username.toLowerCase(),
        password, 
        avatar : avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if(!createdUser){
        throw new apiError(500, "Something went wrong while creating user");
    }

    return res.status(201).json(
        new apiResponse(200, createdUser, "Created user successfully")
    )

})

export {registerUser};