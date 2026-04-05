import { useForm } from "@tanstack/react-form";
import {
  Button,
  FieldError,
  Input,
  Label,
  Spinner,
  Surface,
  TextField,
  useToast,
} from "heroui-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text, TextInput, View, Pressable } from "react-native";
import z from "zod";

import { authClient } from "@/lib/auth-client";

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Use at least 8 characters"),
});

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;

  if (typeof error === "string") {
    return error;
  }

  if (Array.isArray(error)) {
    for (const issue of error) {
      const message = getErrorMessage(issue);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
  }

  return null;
}

function SignIn() {
  const router = useRouter();
  const passwordInputRef = useRef<TextInput>(null);
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      await authClient.signIn.email(
        {
          email: value.email.trim(),
          password: value.password,
        },
        {
          onError(error) {
            toast.show({
              variant: "danger",
              label: error.error?.message || "Failed to sign in",
            });
          },
          onSuccess() {
            formApi.reset();
            toast.show({
              variant: "success",
              label: "Signed in successfully",
            });
            router.replace("/");
          },
        },
      );
    },
  });

  return (
    <Surface variant="secondary" className="p-4 rounded-lg">
      <Text className="text-foreground font-medium mb-4">Sign In</Text>

      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          validationError: getErrorMessage(state.errorMap.onSubmit),
        })}
      >
        {({ isSubmitting, validationError }) => {
          const formError = validationError;

          return (
              <View className="gap-3">
                <form.Field name="email">
                  {(field) => (
                    <View>
                      <TextField isInvalid={!!field.state.meta.errors.length}>
                        <Label>Email</Label>
                        <Input
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChangeText={field.handleChange}
                          placeholder="email@example.com"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoComplete="email"
                          textContentType="emailAddress"
                          returnKeyType="next"
                          blurOnSubmit={false}
                          onSubmitEditing={() => {
                            passwordInputRef.current?.focus();
                          }}
                        />
                      </TextField>
                      {field.state.meta.errors.length > 0 && (
                        <Text style={{ color: '#ff385c', fontSize: 12, marginTop: 4 }}>
                          {getErrorMessage(field.state.meta.errors)}
                        </Text>
                      )}
                    </View>
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <View>
                      <TextField isInvalid={!!field.state.meta.errors.length}>
                        <Label>Password</Label>
                        <View className="relative">
                          <Input
                            ref={passwordInputRef}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChangeText={field.handleChange}
                            placeholder="••••••••"
                            secureTextEntry={!showPassword}
                            autoComplete="password"
                            textContentType="password"
                            returnKeyType="go"
                            onSubmitEditing={form.handleSubmit}
                            className="pr-12"
                          />
                          <Pressable
                            onPress={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2"
                          >
                            <Ionicons
                              name={
                                showPassword ? "eye-off-outline" : "eye-outline"
                              }
                              size={22}
                              color="#999"
                            />
                          </Pressable>
                        </View>
                      </TextField>
                      {field.state.meta.errors.length > 0 && (
                        <Text style={{ color: '#ff385c', fontSize: 12, marginTop: 4 }}>
                          {getErrorMessage(field.state.meta.errors)}
                        </Text>
                      )}
                    </View>
                  )}
                </form.Field>

                <Button
                  onPress={form.handleSubmit}
                  isDisabled={isSubmitting}
                  className="mt-1"
                >
                  {isSubmitting ? (
                    <Spinner size="sm" color="default" />
                  ) : (
                    <Button.Label>Sign In</Button.Label>
                  )}
                </Button>
              </View>
          );
        }}
      </form.Subscribe>
    </Surface>
  );
}

export { SignIn };
